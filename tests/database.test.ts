import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const initial = readFileSync("prisma/migrations/20261021144827_init_users/migration.sql", "utf8");
const migration = readFileSync("prisma/migrations/20261023000000_supabase_auth/migration.sql", "utf8");
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const thirdId = "00000000-0000-4000-8000-000000000003";
const fourthId = "00000000-0000-4000-8000-000000000004";
const meta = { full_name: "Student Name", user_type: "STUDENT", institutional_id: "12345678", phone_number: "08123456789" };
let db: PGlite;

async function baseDatabase() {
  const instance = new PGlite();
  await instance.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
    ${initial}
  `);
  return instance;
}
async function insertIdentity(id: string, email: string, metadata: unknown) {
  return db.query("INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ($1,$2,$3::jsonb)", [id, email, JSON.stringify(metadata)]);
}
async function asRole(role: "anon" | "authenticated", id: string, sql: string) {
  await db.exec(`SET ROLE ${role}`);
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
    return await db.query(sql);
  } finally { await db.exec("RESET ROLE"); }
}

beforeAll(async () => {
  db = await baseDatabase();
  await db.exec(migration);
});
afterAll(async () => { await db?.close(); });

describe.sequential("actual PostgreSQL registration trigger and RLS", () => {
  it("creates a pending student profile atomically; ignores injected privileges", async () => {
    await insertIdentity(firstId, "student@example.test", { ...meta, role: "SUPERADMIN", is_active: false, id: secondId, email: "forged@example.test", password_hash: "forged" });
    const { rows } = await db.query("SELECT * FROM public.users WHERE id = $1", [firstId]);
    expect(rows[0]).toMatchObject({ id: firstId, role: "PARTICIPANT", is_active: true, email: "student@example.test", user_type: "STUDENT", password_hash: null });
  });
  it("creates a lecturer profile with its Auth ID", async () => {
    await insertIdentity(secondId, "lecturer@example.test", { ...meta, user_type: "LECTURER", institutional_id: "87654321" });
    const { rows } = await db.query("SELECT id, user_type FROM public.users WHERE id = $1", [secondId]);
    expect(rows[0]).toEqual({ id: secondId, user_type: "LECTURER" });
  });
  it("rolls back Auth identity when institutional ID is duplicated", async () => {
    await expect(insertIdentity(thirdId, "duplicate@example.test", meta)).rejects.toThrow(/unique/i);
    expect((await db.query("SELECT id FROM auth.users WHERE id = $1", [thirdId])).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM public.users WHERE id = $1", [thirdId])).rows).toHaveLength(0);
  });
  it("enforces normalized email uniqueness", async () => {
    await expect(insertIdentity(thirdId, "STUDENT@EXAMPLE.TEST", { ...meta, institutional_id: "33333333" })).rejects.toThrow(/unique/i);
    expect((await db.query("SELECT id FROM auth.users WHERE id = $1", [thirdId])).rows).toHaveLength(0);
  });
  it.each([{}, { ...meta, user_type: "SUPERADMIN" }, { ...meta, full_name: {} }, { ...meta, institutional_id: " bad! " }, { ...meta, phone_number: "bad" }])("rolls back invalid metadata %j", async metadata => {
    await expect(insertIdentity(thirdId, "invalid@example.test", metadata)).rejects.toThrow(/registration/i);
    expect((await db.query("SELECT id FROM auth.users WHERE id = $1", [thirdId])).rows).toHaveLength(0);
  });
  it("prevents independently generated application identities", async () => {
    await expect(db.query(`INSERT INTO public.users (id,full_name,email,phone_number,role,updated_at)
      VALUES ($1,'Orphan','orphan@example.test','08123456789','PARTICIPANT',now())`, [thirdId])).rejects.toThrow(/foreign key/i);
  });
  it("does not propagate metadata-based role escalation", async () => {
    await db.query("UPDATE auth.users SET raw_user_meta_data = $1::jsonb WHERE id = $2", [JSON.stringify({ role: "SUPERADMIN" }), firstId]);
    expect((await db.query("SELECT role FROM public.users WHERE id=$1", [firstId])).rows[0]).toEqual({ role: "PARTICIPANT" });
  });
  it("synchronizes confirmed Auth email changes", async () => {
    await db.query("UPDATE auth.users SET email='updated@example.test' WHERE id=$1", [firstId]);
    expect((await db.query("SELECT email FROM public.users WHERE id=$1", [firstId])).rows[0]).toEqual({ email: "updated@example.test" });
  });
  it("denies anonymous profile reads", async () => {
    await expect(asRole("anon", "", "SELECT id FROM public.users")).rejects.toThrow(/permission denied/i);
  });
  it("limits authenticated reads to the caller's active profile", async () => {
    expect((await asRole("authenticated", firstId, "SELECT id, role FROM public.users")).rows).toEqual([{ id: firstId, role: "PARTICIPANT" }]);
    expect((await asRole("authenticated", firstId, `SELECT id FROM public.users WHERE id='${secondId}'`)).rows).toHaveLength(0);
  });
  it("hides password hashes including SELECT *", async () => {
    await expect(asRole("authenticated", firstId, "SELECT password_hash FROM public.users")).rejects.toThrow(/permission denied/i);
    await expect(asRole("authenticated", firstId, "SELECT * FROM public.users")).rejects.toThrow(/permission denied/i);
  });
  it.each([
    "UPDATE public.users SET role='SUPERADMIN'", "UPDATE public.users SET is_active=true",
    "DELETE FROM public.users", "INSERT INTO public.users (id) VALUES ('00000000-0000-4000-8000-000000000009')",
  ])("denies browser writes: %s", async sql => {
    await expect(asRole("authenticated", firstId, sql)).rejects.toThrow(/permission denied/i);
  });
  it("hides inactive profiles even with an otherwise valid token", async () => {
    await db.query("UPDATE public.users SET is_active=false WHERE id=$1", [firstId]);
    expect((await asRole("authenticated", firstId, "SELECT id FROM public.users")).rows).toHaveLength(0);
  });
  it("blocks deletion of identities that still have profiles", async () => {
    await expect(db.query("DELETE FROM auth.users WHERE id=$1", [secondId])).rejects.toThrow(/foreign key/i);
  });
  it("has no identity/profile mismatch after failed registrations", async () => {
    expect((await db.query("SELECT a.id FROM auth.users a FULL JOIN public.users p ON p.id=a.id WHERE p.id IS NULL OR a.id IS NULL")).rows).toHaveLength(0);
  });
});

describe("migration safeguards on existing data", () => {
  it("adds Phase 2 without changing existing Auth/profile data, definitions, policies or grants", async () => {
    const instance = await baseDatabase();
    try {
      await instance.exec(migration);
      await instance.query("INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ($1,$2,$3::jsonb)",
        [firstId, "preserved@example.test", JSON.stringify(meta)]);
      const snapshot = async () => ({
        identities: (await instance.query("SELECT * FROM auth.users ORDER BY id")).rows,
        profiles: (await instance.query("SELECT * FROM public.users ORDER BY id")).rows,
        columns: (await instance.query(`SELECT table_schema, column_name, data_type, is_nullable, column_default
          FROM information_schema.columns WHERE table_name='users' AND table_schema IN ('auth','public')
          ORDER BY table_schema, ordinal_position`)).rows,
        tables: (await instance.query(`SELECT oid::regclass::text AS name, relrowsecurity, relforcerowsecurity, relacl::text
          FROM pg_class WHERE oid IN ('auth.users'::regclass,'public.users'::regclass) ORDER BY name`)).rows,
        triggers: (await instance.query(`SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
          FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.users'::regclass) AND NOT tgisinternal
          ORDER BY tgname`)).rows,
        functions: (await instance.query(`SELECT proname, pg_get_functiondef(oid) AS definition, proacl::text
          FROM pg_proc WHERE oid IN ('auth.uid()'::regprocedure,
            'public.handle_auth_user_created()'::regprocedure,'public.handle_auth_email_changed()'::regprocedure)
          ORDER BY proname`)).rows,
        policies: (await instance.query(`SELECT * FROM pg_policies WHERE tablename='users'
          AND schemaname IN ('auth','public') ORDER BY schemaname, policyname`)).rows,
        grants: (await instance.query(`SELECT table_schema, column_name, grantee, privilege_type, is_grantable
          FROM information_schema.column_privileges WHERE table_name='users' AND table_schema IN ('auth','public')
          ORDER BY table_schema, column_name, grantee, privilege_type`)).rows,
        constraints: (await instance.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
          FROM pg_constraint WHERE conrelid IN ('auth.users'::regclass,'public.users'::regclass) ORDER BY conname`)).rows,
      });
      const before = await snapshot();
      await instance.exec(readFileSync("prisma/migrations/20261023010000_phase2_assessment/migration.sql", "utf8"));
      expect(await snapshot()).toEqual(before);
      // The existing registration and email-sync triggers still execute after migration.
      await instance.query("INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES ($1,$2,$3::jsonb)",
        [secondId, "after@example.test", JSON.stringify({ ...meta, institutional_id: "87654321" })]);
      await instance.query("UPDATE auth.users SET email='changed@example.test' WHERE id=$1", [secondId]);
      expect((await instance.query("SELECT id,email,role FROM public.users WHERE id=$1", [secondId])).rows)
        .toEqual([{ id: secondId, email: "changed@example.test", role: "PARTICIPANT" }]);
    } finally { await instance.close(); }
  });
  it("aborts without changing an unmatched legacy profile or hash", async () => {
    const legacy = await baseDatabase();
    try {
      await legacy.query(`INSERT INTO public.users (id,full_name,email,password_hash,phone_number,role,updated_at)
        VALUES ($1,'Legacy User','legacy@example.test','retain-this-hash','08123456789','PARTICIPANT',now())`, [fourthId]);
      await expect(legacy.exec(migration)).rejects.toThrow(/Reconcile legacy/);
      await legacy.exec("ROLLBACK");
      expect((await legacy.query("SELECT password_hash FROM public.users")).rows[0]).toEqual({ password_hash: "retain-this-hash" });
      expect((await legacy.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='users' AND table_schema='public' AND column_name='password_hash'")).rows[0]).toEqual({ is_nullable: "NO" });
    } finally { await legacy.close(); }
  });
});
