import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

const approved = "SET wellbeing.approved_hosted_ref='bofoowyzlnfhwcstlmgp'";
const sql = (name: string) => readFile(`deployment/hosted/${name}.sql`, "utf8");

it("revokes ledger table/column rights, preserves contents/operator, and passes metadata verification", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public._prisma_migrations(migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz);
      INSERT INTO public._prisma_migrations VALUES('synthetic','unchanged',now(),NULL);
      GRANT ALL ON public._prisma_migrations TO PUBLIC,anon,authenticated;
      GRANT SELECT(checksum),UPDATE(checksum) ON public._prisma_migrations TO PUBLIC,anon,authenticated; ${approved};`);
    const before = (await db.query("SELECT * FROM public._prisma_migrations")).rows;
    await db.exec(await sql("ledger-acl"));
    expect((await db.query("SELECT * FROM public._prisma_migrations")).rows).toEqual(before);
    const rows = (await db.exec(await sql("ledger-acl-verify"))).flatMap(r => r.rows) as Array<Record<string, unknown>>;
    expect(rows.filter(r => "table_access" in r).every(r => r.table_access === false && r.column_access === false)).toBe(true);
    expect(rows.find(r => "operator_select" in r)).toEqual({ operator_select: true, operator_insert: true, operator_update: true, operator_delete: true });
    expect(rows.filter(r => "privilege_type" in r)).toHaveLength(0);
  } finally { await db.close(); }
});

it("rolls back the entire ledger patch when inherited or SET ROLE privileges remain", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon NOINHERIT; CREATE ROLE authenticated; CREATE ROLE inherited_reader;
      CREATE TABLE public._prisma_migrations(checksum text);
      GRANT SELECT(checksum) ON public._prisma_migrations TO inherited_reader;
      GRANT inherited_reader TO anon WITH INHERIT FALSE, SET TRUE;
      GRANT INSERT ON public._prisma_migrations TO authenticated; ${approved};`);
    await expect(db.exec(await sql("ledger-acl"))).rejects.toThrow("Remaining inherited/effective ledger privilege");
    await db.exec("ROLLBACK");
    expect((await db.query("SELECT has_table_privilege('authenticated','public._prisma_migrations','INSERT') AS retained")).rows).toEqual([{ retained: true }]);
  } finally { await db.close(); }
});

it("keeps human Auth/profile behavior and isolates reserved machines, hook permissions and revocation", async () => {
  const db = new PGlite();
  const machine = "00000000-0000-4000-8000-000000000001";
  const human = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin;
      CREATE ROLE wb_report_storage; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
      CREATE SCHEMA storage; CREATE TABLE storage.objects(name text); CREATE TABLE storage.buckets(id text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO wb_report_storage; GRANT SELECT ON storage.objects TO wb_report_storage;
      CREATE POLICY fixture_read ON storage.objects FOR SELECT TO wb_report_storage USING(true);
      INSERT INTO storage.objects VALUES('synthetic.pdf'); ${approved};`);
    await db.exec(await readFile("prisma/migrations/20261021144827_init_users/migration.sql", "utf8"));
    await db.exec(await readFile("prisma/migrations/20261023000000_supabase_auth/migration.sql", "utf8"));
    await db.exec(await sql("worker-auth"));
    await db.query("INSERT INTO wb_machine.identities VALUES($1,'worker@example.invalid',false)", [machine]);
    await db.query("INSERT INTO auth.users VALUES($1,'worker@example.invalid','{}')", [machine]);
    expect((await db.query("SELECT id FROM public.users")).rows).toHaveLength(0);
    await db.query("INSERT INTO auth.users VALUES($1,'human@example.invalid',$2::jsonb)", [human, JSON.stringify({ full_name: "Synthetic Human", institutional_id: "TEST0002", phone_number: "081234567890", user_type: "STUDENT", role: "SUPERADMIN" })]);
    expect((await db.query("SELECT id,role FROM public.users")).rows).toEqual([{ id: human, role: "PARTICIPANT" }]);
    const event = { user_id: human, authentication_method: "password", claims: { sub: human, role: "authenticated", user_metadata: { role: "wb_report_storage" } } };
    await db.exec("SET ROLE supabase_auth_admin");
    expect((await db.query("SELECT wb_machine.access_token_hook($1::jsonb) AS result", [JSON.stringify(event)])).rows).toEqual([{ result: event }]);
    const workerEvent = { user_id: machine, authentication_method: "token_refresh", claims: { sub: machine, email: "worker@example.invalid", aud: "authenticated", iss: "https://bofoowyzlnfhwcstlmgp.supabase.co/auth/v1", iat: 1800000000, exp: 1800003600, role: "authenticated" } };
    await expect(db.query("SELECT wb_machine.access_token_hook($1::jsonb)", [JSON.stringify(workerEvent)])).rejects.toThrow("Worker authentication denied");
    await db.exec("RESET ROLE; UPDATE wb_machine.identities SET enabled=true; SET ROLE supabase_auth_admin");
    const result = (await db.query<{ result: { claims: { role: string; exp: number } } }>("SELECT wb_machine.access_token_hook($1::jsonb) AS result", [JSON.stringify(workerEvent)])).rows[0].result;
    expect(result.claims.role).toBe("wb_report_storage"); expect(result.claims.exp).toBe(1800000900);
    await db.exec("RESET ROLE; SET ROLE anon");
    await expect(db.query("SELECT wb_machine.access_token_hook($1::jsonb)", [JSON.stringify(event)])).rejects.toThrow();
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: machine })]);
    await db.exec("SET ROLE wb_report_storage");
    expect((await db.query("SELECT * FROM storage.objects")).rows).toHaveLength(1);
    await db.exec("RESET ROLE; UPDATE wb_machine.identities SET enabled=false; SET ROLE wb_report_storage");
    expect((await db.query("SELECT * FROM storage.objects")).rows).toHaveLength(0);
  } finally { await db.close(); }
});
