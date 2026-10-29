// Creates a fresh synthetic local database only after an explicit flag.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertPhase3RehearsalEnvironment } from "./phase3-safety.mjs";

const migrationNames = [
  "20261021144827_init_users",
  "20261023000000_supabase_auth",
  "20261023010000_phase2_assessment",
  "20261028000000_psychologist_profiles",
  "20261029000000_psychologist_availability",
  "20261029000001_appointments_report_consent",
];

if (!process.argv.includes("--create-approved-synthetic")) {
  console.log("Preparation only: creates no database. To run, explicitly pass --create-approved-synthetic; Phase 3 uses a fresh local PostgreSQL 17 container and synthetic data.");
} else {
  const token = randomBytes(16).toString("hex");
  const password = randomBytes(32).toString("hex");
  const suffix = randomBytes(5).toString("hex");
  const container = `wellbeing-phase3-${suffix}`;
  const volume = `${container}-data`;
  const scratch = resolve(".tmp", `phase3-rehearsal-${new Date().toISOString().replaceAll(":", "-")}`);
  mkdirSync(scratch, { recursive: true });

  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/SUPABASE|DATABASE|DIRECT_URL|^PG|^POSTGRES|^PRISMA|^NODE_OPTIONS$|^DEBUG$|^PHASE[23]_/i.test(key)));
  const env = {
    ...baseEnv,
    POSTGRES_PASSWORD: password,
    PHASE3_REHEARSAL_APPROVED: "synthetic-local-only",
    PHASE3_REHEARSAL_TOKEN: token,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    SITE_URL: "http://127.0.0.1:55430",
    NODE_ENV: "test",
    PHASE3_EVIDENCE_DIR: scratch,
  };
  let stage = "docker-locality";

  function sanitize(value) {
    return String(value ?? "").replaceAll(password, "[REDACTED]").replaceAll(token, "[ISOLATION_MARKER]")
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
  }

  function run(command, args, input, commandEnv = env) {
    const startedAt = Date.now();
    const result = spawnSync(command, args, {
      env: commandEnv, input, encoding: "utf8", windowsHide: true,
      timeout: 240000, maxBuffer: 8 * 1024 * 1024,
    });
    appendFileSync(join(scratch, "operations.jsonl"), JSON.stringify({ stage, exitCode: result.status, elapsedMs: Date.now() - startedAt }) + "\n");
    if (command === process.execPath || result.status !== 0)
      appendFileSync(join(scratch, "execution.log"), `\n[${stage}]\n${sanitize(result.stdout)}${sanitize(result.stderr)}\n`);
    if (result.status !== 0) throw new Error("operation failed");
    return result.stdout;
  }

  function verifyLocalContainer(port, imageId) {
    const info = JSON.parse(run("docker", ["inspect", container]))[0];
    const published = info.NetworkSettings.Ports["5432/tcp"];
    const mounts = info.Mounts;
    if (info.Config.Labels["wellbeing.rehearsal"] !== token || info.Config.Image !== "postgres:17" || info.Image !== imageId
      || !info.State.Running || Object.keys(info.NetworkSettings.Ports).length !== 1
      || published?.length !== 1 || published[0].HostIp !== "127.0.0.1" || published[0].HostPort !== String(port)
      || mounts.length !== 1 || mounts[0].Type !== "volume" || mounts[0].Name !== volume || mounts[0].Destination !== "/var/lib/postgresql/data") {
      throw new Error("container isolation check failed");
    }
    const volumeInfo = JSON.parse(run("docker", ["volume", "inspect", volume]))[0];
    if (volumeInfo.Labels["wellbeing.rehearsal"] !== token) throw new Error("volume isolation check failed");
    return info;
  }

  try {
    stage = "docker-locality";
    const context = JSON.parse(run("docker", ["context", "inspect"]))[0];
    const dockerHost = env.DOCKER_HOST || context.Endpoints.docker.Host;
    if (!(dockerHost.startsWith("npipe:////./pipe/") || dockerHost === "unix:///var/run/docker.sock")) throw new Error("nonlocal Docker endpoint");
    const dockerVersion = run("docker", ["info", "--format", "{{.ServerVersion}}"]).trim();
    if (run("docker", ["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"]).trim()) throw new Error("container name collision");
    if (run("docker", ["volume", "ls", "--filter", `name=^${volume}$`, "--format", "{{.Name}}"]).trim()) throw new Error("volume name collision");
    const image = JSON.parse(run("docker", ["image", "inspect", "postgres:17"]))[0];
    if (!(image.RepoDigests ?? []).some(digest => /^(?:docker\.io\/library\/)?postgres@sha256:[a-f0-9]{64}$/.test(digest))) throw new Error("unverified PostgreSQL image");

    stage = "fresh volume creation";
    run("docker", ["volume", "create", "--label", `wellbeing.rehearsal=${token}`, volume]);
    stage = "fresh container creation";
    run("docker", ["run", "-d", "--name", container, "--label", `wellbeing.rehearsal=${token}`,
      "-p", "127.0.0.1::5432", "--mount", `type=volume,source=${volume},target=/var/lib/postgresql/data`,
      "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=wellbeing_phase3_rehearsal",
      "--health-cmd", "pg_isready -h 127.0.0.1 -U postgres -d wellbeing_phase3_rehearsal",
      "--health-interval", "1s", "--health-retries", "30", "postgres:17"]);
    const portOutput = run("docker", ["port", container, "5432/tcp"]).trim();
    const match = /^127\.0\.0\.1:(\d+)$/.exec(portOutput);
    const port = Number(match?.[1]);
    if (!Number.isInteger(port) || port < 49152 || port > 65535) throw new Error("container port is not local/ephemeral");
    const url = `postgresql://postgres:${password}@127.0.0.1:${port}/wellbeing_phase3_rehearsal?connection_limit=8`;
    Object.assign(env, { DATABASE_URL: url, DIRECT_URL: url, PHASE3_REHEARSAL_PORT: String(port) });
    assertPhase3RehearsalEnvironment(env);
    const info = verifyLocalContainer(port, image.Id);
    writeFileSync(join(scratch, "isolation.json"), JSON.stringify({
      dockerVersion, localDockerEndpoint: dockerHost, container, volume, imageId: info.Image,
      imageDigests: image.RepoDigests, publishedAddress: `127.0.0.1:${port}`,
      database: "wellbeing_phase3_rehearsal", hostedCredentialsExcludedFromChildEnvironment: true,
      productionDataCopied: false,
    }, null, 2));

    stage = "PostgreSQL startup";
    for (let attempt = 0; ; attempt++) {
      verifyLocalContainer(port, image.Id);
      const ready = spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "wellbeing_phase3_rehearsal"], { windowsHide: true });
      if (ready.status === 0) break;
      if (attempt >= 30) throw new Error("PostgreSQL did not become ready");
      await new Promise(resolveWait => setTimeout(resolveWait, 1000));
    }

    function sql(input) {
      verifyLocalContainer(port, image.Id);
      return run("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "wellbeing_phase3_rehearsal"], input);
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

    const migrationsDirectory = join(scratch, "migrations");
    mkdirSync(migrationsDirectory, { recursive: true });
    copyFileSync("prisma/schema.prisma", join(scratch, "schema.prisma"));
    copyFileSync("prisma/migrations/migration_lock.toml", join(migrationsDirectory, "migration_lock.toml"));
    function copyMigrations(names) {
      for (const name of names) {
        const target = join(migrationsDirectory, name);
        mkdirSync(target, { recursive: true });
        copyFileSync(`prisma/migrations/${name}/migration.sql`, join(target, "migration.sql"));
      }
    }
    function migrate() {
      verifyLocalContainer(port, image.Id);
      run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", join(scratch, "schema.prisma")]);
    }

    copyMigrations(migrationNames.slice(0, 2));
    stage = "Auth migrations";
    migrate();
    stage = "synthetic baseline identity";
    sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ('00000000-0000-4000-8000-000000000901','baseline@example.test',
      '{"full_name":"SYNTHETIC BASELINE","user_type":"STUDENT","institutional_id":"TEST00901","phone_number":"08000000001"}');
      CREATE TABLE rehearsal.profile_before AS SELECT * FROM public.users;
      CREATE TABLE rehearsal.auth_triggers_before AS SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal;`);

    copyMigrations(migrationNames.slice(2));
    stage = "Phase 2, B1 and Phase 3 migrations";
    migrate();
    stage = "Phase 3 real PostgreSQL rehearsal";
    verifyLocalContainer(port, image.Id);
    run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.phase3.rehearsal.config.ts"]);

    const postgresVersion = run("docker", ["exec", container, "postgres", "--version"]).trim();
    const migrationHashes = migrationNames.map(name => ({
      name, sha256: createHash("sha256").update(readFileSync(`prisma/migrations/${name}/migration.sql`)).digest("hex"),
    }));
    writeFileSync(join(scratch, "result.json"), JSON.stringify({
      status: "PASS_SYNTHETIC_POSTGRESQL_ONLY", completedAt: new Date().toISOString(),
      imageId: info.Image, imageDigests: image.RepoDigests, postgresVersion,
      prisma: JSON.parse(readFileSync("node_modules/prisma/package.json", "utf8")).version,
      migrations: migrationHashes, container, volume, hostedAuthVerified: false, backupRestored: false,
    }, null, 2));
    console.log("Phase 3 synthetic PostgreSQL rehearsal passed. Evidence is in the ignored .tmp rehearsal directory; this is not hosted Supabase acceptance.");
  } catch {
    writeFileSync(join(scratch, "result.json"), JSON.stringify({ status: "FAILED", stage, completedAt: new Date().toISOString(), hostedAuthVerified: false }, null, 2));
    console.error(`Phase 3 rehearsal stopped at: ${stage}. No pass claim. Diagnostics are sanitized; the isolated container and volume are retained.`);
    process.exitCode = 1;
  }
}
