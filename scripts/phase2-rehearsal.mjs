// No action without explicit approval. Creates only a fresh, synthetic Docker DB.
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, copyFileSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { assertRehearsalEnvironment } from "./phase2-safety.mjs";

if (!process.argv.includes("--create-approved-synthetic")) {
  console.log("Preparation only: postgres:17, 127.0.0.1:55432, wellbeing-phase2-rehearsal. No Docker/database action. See docs/PHASE2-REHEARSAL.md.");
} else {
  const container = "wellbeing-phase2-rehearsal";
  const volume = "wellbeing-phase2-rehearsal-data";
  const token = randomBytes(16).toString("hex"), password = randomBytes(32).toString("hex");
  const scratch = resolve(".tmp", `phase2-rehearsal-${new Date().toISOString().replaceAll(":", "-")}`);
  mkdirSync(scratch, { recursive: true });
  const url = `postgresql://postgres:${password}@127.0.0.1:55432/wellbeing_phase2_rehearsal?connection_limit=8`;
  // Override process env before importing Prisma; never load Next environment files.
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/SUPABASE|DATABASE|DIRECT_URL|^PG|^POSTGRES|^PRISMA|^NODE_OPTIONS$|^DEBUG$/i.test(key)));
  const env = { ...baseEnv, DATABASE_URL: url, DIRECT_URL: url, POSTGRES_PASSWORD: password,
    PHASE2_REHEARSAL_APPROVED: "synthetic-local-only", PHASE2_REHEARSAL_TOKEN: token,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_SECRET_KEY: "",
    SITE_URL: "http://127.0.0.1:55430", NODE_ENV: "test", PHASE2_EVIDENCE_DIR: scratch };
  function sanitize(value) {
    return String(value ?? "").replaceAll(password, "[REDACTED]").replaceAll(token, "[ISOLATION_MARKER]")
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
  }
  let stage = "guard";
  try {
    assertRehearsalEnvironment(env);
    function run(command, args, input) {
      const started = Date.now();
      const result = spawnSync(command, args, { env, input, encoding: "utf8", windowsHide: true, timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
      appendFileSync(join(scratch, "operations.jsonl"), JSON.stringify({ stage, exitCode: result.status, elapsedMs: Date.now() - started }) + "\n");
      if (command === process.execPath || result.status !== 0)
        appendFileSync(join(scratch, "execution.log"), `\n[${stage}]\n${sanitize(result.stdout)}${sanitize(result.stderr)}\n`);
      if (result.status !== 0) throw 0;
      return result.stdout;
    }
    stage = "Docker readiness";
    const context = JSON.parse(run("docker", ["context", "inspect"]))[0];
    const host = env.DOCKER_HOST || context.Endpoints.docker.Host;
    if (!(host.startsWith("npipe:////./pipe/") || host === "unix:///var/run/docker.sock")) throw 0;
    const dockerVersion = run("docker", ["info", "--format", "{{.ServerVersion}}"]).trim();
    if (run("docker", ["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.Names}} "]).trim()) throw 0;
    if (run("docker", ["volume", "ls", "--filter", `name=^${volume}$`, "--format", "{{.Name}} "]).trim()) throw 0;
    const image = JSON.parse(run("docker", ["image", "inspect", "postgres:17"]))[0];
    if (!(image.RepoDigests ?? []).some(d => /^(?:docker\.io\/library\/)?postgres@sha256:[a-f0-9]{64}$/.test(d))) throw 0;
    stage = "fresh volume creation";
    run("docker", ["volume", "create", "--label", `wellbeing.rehearsal=${token}`, volume]);
    // Explicit approval includes an image download if postgres:17 is absent.
    stage = "fresh container creation";
    run("docker", ["run", "-d", "--name", container, "--label", `wellbeing.rehearsal=${token}`,
      "-p", "127.0.0.1:55432:5432", "--mount", `type=volume,source=${volume},target=/var/lib/postgresql/data`,
      "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=wellbeing_phase2_rehearsal",
      "--health-cmd", "pg_isready -h 127.0.0.1 -U postgres -d wellbeing_phase2_rehearsal", "--health-interval", "1s",
      "--health-retries", "30", "postgres:17"]);
    function verifyContainer() {
      assertRehearsalEnvironment(env);
      const info = JSON.parse(run("docker", ["inspect", container]))[0];
      const port = info.NetworkSettings.Ports["5432/tcp"];
      const mounts = info.Mounts;
      if (info.Config.Labels["wellbeing.rehearsal"] !== token || info.Config.Image !== "postgres:17" || info.Image !== image.Id ||
        !info.State.Running || Object.keys(info.NetworkSettings.Ports).length !== 1 ||
        port?.length !== 1 || port[0].HostIp !== "127.0.0.1" || port[0].HostPort !== "55432" ||
        mounts.length !== 1 || mounts[0].Type !== "volume" || mounts[0].Name !== volume || mounts[0].Destination !== "/var/lib/postgresql/data") throw 0;
      return info;
    }
    const info = verifyContainer();
    writeFileSync(join(scratch, "isolation.json"), JSON.stringify({ dockerVersion, localDockerEndpoint: host, container, volume,
      imageId: info.Image, imageDigests: image.RepoDigests, publishedAddress: "127.0.0.1:55432", database: "wellbeing_phase2_rehearsal",
      targetsOverridden: true, hostedCredentialsExcludedFromChildEnvironment: true, productionDataCopied: false }, null, 2));
    stage = "PostgreSQL startup";
    for (let attempt = 0; ; attempt++) {
      const ready = spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "wellbeing_phase2_rehearsal"], { windowsHide: true });
      if (ready.status === 0) break;
      if (attempt >= 30) throw 0;
      await new Promise(resolveWait => setTimeout(resolveWait, 1000));
    }
    function sql(input) {
      verifyContainer();
      return run("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "wellbeing_phase2_rehearsal"], input);
    }
    stage = "synthetic Auth baseline";
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
      CREATE SCHEMA rehearsal;
      CREATE TABLE rehearsal.identity (token text NOT NULL);
      INSERT INTO rehearsal.identity VALUES ('${token}');`);
    mkdirSync(join(scratch, "migrations"), { recursive: true });
    copyFileSync("prisma/schema.prisma", join(scratch, "schema.prisma"));
    copyFileSync("prisma/migrations/migration_lock.toml", join(scratch, "migrations", "migration_lock.toml"));
    for (const name of ["20261021144827_init_users", "20261023000000_supabase_auth"]) {
      mkdirSync(join(scratch, "migrations", name));
      copyFileSync(`prisma/migrations/${name}/migration.sql`, join(scratch, "migrations", name, "migration.sql"));
    }
    stage = "both Auth migrations";
    verifyContainer();
    run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", join(scratch, "schema.prisma")]);
    sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ('00000000-0000-4000-8000-000000000901','baseline@example.test',
      '{"full_name":"SYNTHETIC BASELINE","user_type":"STUDENT","institutional_id":"TEST00901","phone_number":"08000000001"}');
      CREATE TABLE rehearsal.profile_before AS SELECT * FROM public.users;
      CREATE TABLE rehearsal.auth_triggers_before AS SELECT tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal;`);
    stage = "Phase 2 migration";
    verifyContainer();
    run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
    stage = "real PostgreSQL service rehearsal";
    verifyContainer();
    run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.rehearsal.config.ts"]);
    const postgresVersion = run("docker", ["exec", container, "postgres", "--version"]).trim();
    const migrations = ["20261021144827_init_users", "20261023000000_supabase_auth", "20261023010000_phase2_assessment"].map(name => ({ name,
      sha256: createHash("sha256").update(readFileSync(`prisma/migrations/${name}/migration.sql`)).digest("hex") }));
    const evidence = { status: "PASS_SYNTHETIC_POSTGRESQL_ONLY", completedAt: new Date().toISOString(),
      imageId: info.Image, imageDigests: image.RepoDigests, postgresVersion, prisma: JSON.parse(readFileSync("node_modules/prisma/package.json", "utf8")).version,
      migrations, container, volume, hostedAuthVerified: false, backupRestored: false };
    writeFileSync(join(scratch, "result.json"), JSON.stringify(evidence, null, 2));
    console.log("Synthetic PostgreSQL rehearsal passed. Evidence is in the ignored .tmp rehearsal directory. This is not a Supabase restoration or hosted Auth test.");
  } catch {
    writeFileSync(join(scratch, "result.json"), JSON.stringify({ status: "FAILED", stage, completedAt: new Date().toISOString(), hostedAuthVerified: false }, null, 2));
    console.error(`Rehearsal stopped at: ${stage}. No pass claim. Raw diagnostics suppressed; container retained for private inspection.`);
    process.exitCode = 1;
  }
  // No automatic removal: preserve failed state/evidence and avoid destructive cleanup.
}
