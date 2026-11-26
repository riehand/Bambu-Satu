"""Start/stop the existing Windows Sprint 1-3 stack. Never provision or reset data."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.tmp/local-manual'
CONTAINERS = ['wb-sprint1-db', 'wb-sprint1-auth-real', 'wb-sprint1-storage', 'wb-sprint1-kong']
SITE = 'http://127.0.0.1:55430'


def run(args, stdin=None):
    result = subprocess.run(args, input=stdin, capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=ROOT)
    if result.returncode:
        # Subprocess output may contain connection strings; keep it out of the console.
        raise RuntimeError('Local command failed: ' + args[0])
    return result.stdout.strip()


def ps(command):
    return json.loads(run(['powershell.exe', '-NoProfile', '-Command', command]) or 'null')


def config(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))


def local_url(value, scheme, port, role=None):
    u = urlsplit(value)
    assert u.scheme == scheme and u.hostname == '127.0.0.1' and u.port == port, 'Nonlocal or unexpected endpoint'
    if role:
        assert u.username == role and u.path == '/wellbeing_phase3_rehearsal', 'Unexpected database role/name'
    else:
        assert not u.username and not u.password, 'Unexpected HTTP credential'


def inspect_stack():
    context = json.loads(run(['docker', 'context', 'inspect']))[0]
    assert context['Endpoints']['docker']['Host'].startswith('npipe:////./pipe/'), 'Local Docker Desktop required'
    result = {}
    for name in CONTAINERS:
        item = json.loads(run(['docker', 'inspect', name]))[0]
        assert item['Config']['Labels'].get('wellbeing.sprint') == 'phase4-sprint1', 'Unexpected container owner'
        assert set(item['NetworkSettings']['Networks']) == {'wb-sprint1-loopback'}, 'Unexpected network'
        bindings = item['HostConfig']['PortBindings'] or {}
        expected = {'5432/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '50244'}]} if name.endswith('-db') else {'8000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '50243'}]} if name.endswith('-kong') else {}
        assert bindings == expected, 'Unsafe or unexpected host binding'
        result[name] = item
    return result


def settings(stack):
    runtime = config('.tmp/phase4-sprint1/runtime-local.json')
    auth = config('.tmp/phase4-sprint1/browser-local.json')
    worker = config('.tmp/phase4-sprint2/worker-local.json')
    bridge = config('.tmp/phase4-sprint2/website-worker-local.json')
    local_url(runtime['url'], 'postgresql', 50244, 'website_runtime')
    local_url(worker['databaseUrl'], 'postgresql', 50244, 'wb_pdf_worker')
    local_url(worker['storageUrl'], 'http', 50243)
    local_url(bridge['url'], 'http', 55440)
    assert worker['port'] == 55440 and worker['databasePort'] == '50244'
    assert bridge['token'] == worker['token'], 'Worker token mismatch'
    storage = dict(v.split('=', 1) for v in stack['wb-sprint1-storage']['Config']['Env'])
    assert auth['publishableKey'] == storage['ANON_KEY'], 'Auth key is not from this local stack'
    assert worker['storageKey'] == storage['SERVICE_KEY'], 'Storage key is not from this local stack'
    return runtime, auth, worker, bridge


def listening(port):
    return ps(f'ConvertTo-Json -Compress -InputObject @(Get-NetTCPConnection -State Listen -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object LocalAddress,OwningProcess)') or []


def process(pid):
    return ps(f'Get-CimInstance Win32_Process -Filter "ProcessId={int(pid)}" | Select-Object ProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress')


def stop_apps():
    file = STATE / 'processes.json'
    if not file.exists():
        print('No managed process record. No processes stopped.')
        return
    saved = json.loads(file.read_text(encoding='utf-8'))
    for item in reversed(saved):
        current = process(item['pid'])
        if not current:
            continue
        assert current['CreationDate'] == item['created'], 'PID was reused; refusing to stop it'
        assert item['entry'] in current['CommandLine'], 'Process identity changed'
        run(['taskkill.exe', '/PID', str(item['pid']), '/T', '/F'])
        print(item['name'] + ' stopped (data preserved).')
    file.write_text('[]', encoding='utf-8')


def start(stack, values):
    runtime, auth, worker, bridge = values
    existing = json.loads((STATE / 'processes.json').read_text(encoding='utf-8')) if (STATE / 'processes.json').exists() else []
    for name in CONTAINERS:
        if not stack[name]['State']['Running']:
            run(['docker', 'start', name])
            print(name + ' resumed with its existing volume.')
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if all(json.loads(run(['docker', 'inspect', name]))[0]['State'].get('Health', {}).get('Status') == 'healthy' for name in CONTAINERS):
            break
        time.sleep(1)
    else:
        raise RuntimeError('Existing containers not healthy; no reset attempted')
    marker = run(['docker', 'exec', 'wb-sprint1-db', 'psql', '-X', '-At', '-U', 'supabase_admin', '-d', 'wellbeing_phase3_rehearsal', '-c', 'SELECT token FROM rehearsal.identity'])
    assert marker == runtime['marker'], 'Database marker mismatch'
    headers = {'apikey': worker['storageKey'], 'Authorization': 'Bearer ' + worker['storageKey']}
    with urllib.request.urlopen(urllib.request.Request(worker['storageUrl'] + '/storage/v1/bucket/assessment-reports', headers=headers), timeout=10) as response:
        assert json.load(response)['public'] is False, 'Private bucket required'
    allowed = {'PATH','PATHEXT','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','COMSPEC','PROCESSOR_ARCHITECTURE'}
    base = {k: v for k, v in os.environ.items() if k.upper() in allowed}
    common = {**base, 'NODE_ENV':'test', 'NEXT_TELEMETRY_DISABLED':'1', 'SITE_URL':SITE, 'NEXT_PUBLIC_SITE_URL':SITE,
              'NEXT_PUBLIC_SUPABASE_URL':worker['storageUrl'], 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY':auth['publishableKey'],
              'NEXT_PUBLIC_SUPABASE_ANON_KEY':auth['publishableKey'], 'SUPABASE_SECRET_KEY':'', 'SUPABASE_SERVICE_ROLE_KEY':''}
    worker_env = {**common, 'DATABASE_URL':worker['databaseUrl'], 'DIRECT_URL':worker['databaseUrl'],
                  'WELLBEING_PDF_WORKER_FILE':str(ROOT / '.tmp/phase4-sprint2/worker-local.json'), 'WELLBEING_LOCAL_RUNTIME_FILE':''}
    website_env = {**common, 'DATABASE_URL':runtime['url'], 'DIRECT_URL':runtime['url'], 'PHASE3_REHEARSAL_APPROVED':'synthetic-local-only',
                   'PHASE3_REHEARSAL_TOKEN':runtime['marker'], 'PHASE3_REHEARSAL_PORT':'50244',
                   'WELLBEING_LOCAL_RUNTIME_FILE':str(ROOT / '.tmp/phase4-sprint1/runtime-local.json'),
                   'WELLBEING_PDF_WORKER_URL':bridge['url'], 'WELLBEING_PDF_WORKER_TOKEN':bridge['token'], 'WELLBEING_PDF_WORKER_FILE':''}
    for name, port, entry, args, env in [
        ('worker', 55440, str(ROOT/'scripts/run-local-pdf-worker.mjs'), [], worker_env),
        ('website', 55430, str(ROOT/'node_modules/next/dist/bin/next'), ['dev','--hostname','127.0.0.1','--port','55430'], website_env),
    ]:
        record = next((r for r in existing if r['name'] == name), None)
        current = process(record['pid']) if record else None
        if current and current['CreationDate'] == record['created'] and entry in current['CommandLine']:
            assert all(x['LocalAddress'] == '127.0.0.1' for x in listening(port)), 'Unexpected binding'
            print(name + ' already managed; retained.')
            continue
        assert not listening(port), f'Port {port} occupied by an unmanaged process; inspect before restarting'
        with (STATE / (name + '.log')).open('a', encoding='utf-8') as log:
            child = subprocess.Popen(['node', entry, *args], cwd=ROOT, env=env, stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW)
        current = process(child.pid)
        assert current, name + ' exited; inspect local log'
        existing = [r for r in existing if r['name'] != name] + [{'name':name,'pid':child.pid,'entry':entry,'created':current['CreationDate']}]
        (STATE / 'processes.json').write_text(json.dumps(existing, indent=2), encoding='utf-8')
        print(name + ' launched on loopback; log: .tmp/local-manual/' + name + '.log')
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            assert all(listening(port) and all(x['LocalAddress'] == '127.0.0.1' for x in listening(port)) for port in [55430,55440])
            with urllib.request.urlopen(SITE + '/auth/login', timeout=5) as response:
                assert response.status == 200
            try:
                urllib.request.urlopen(bridge['url'], timeout=5).close()
                raise RuntimeError('Worker unexpectedly accepted an unauthenticated request')
            except urllib.error.HTTPError as error:
                assert error.code == 403
            print('Ready: ' + SITE + '/auth/login')
            return
        except (urllib.error.URLError, TimeoutError, AssertionError):
            time.sleep(1)
    raise RuntimeError('Startup not ready; inspect .tmp/local-manual logs (no data reset)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start','status','stop','stop-all'])
    args = parser.parse_args()
    assert os.name == 'nt', 'This launcher uses the existing Windows Docker Desktop stack'
    os.chdir(ROOT)
    STATE.mkdir(parents=True, exist_ok=True)
    if args.action == 'stop':
        stop_apps()
        return
    stack = inspect_stack()
    values = settings(stack)
    if args.action == 'start':
        start(stack, values)
    elif args.action == 'stop-all':
        stop_apps()
        for name in reversed(CONTAINERS):
            if stack[name]['State']['Running']:
                run(['docker','stop',name])
        print('Only the four verified Sprint containers stopped; containers and volumes retained.')
    else:
        for name, item in stack.items():
            print(name + ': ' + item['State']['Status'] + '; loopback/private network verified')
        for port in [55430,55440]:
            print(str(port) + ': ' + json.dumps(listening(port)))
        print('Local config roles: website_runtime / wb_pdf_worker; keys match existing local Storage.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No traceback or subprocess output containing secret values.
        print('Stopped safely: ' + (str(error) if isinstance(error, (AssertionError, RuntimeError)) else type(error).__name__))
        raise SystemExit(1)
