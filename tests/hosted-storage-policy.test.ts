import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";

// In-memory SQL only: no TCP connection, Docker, hosted credentials or Auth data.
const db = new PGlite();
const path = "reports/00000000-0000-4000-8000-000000000001.pdf";
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE authenticator NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean NOT NULL, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(bucket_id text, name text, PRIMARY KEY(bucket_id,name));
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO PUBLIC;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.buckets,storage.objects TO PUBLIC;
    CREATE POLICY existing_objects ON storage.objects TO PUBLIC USING(true) WITH CHECK(true);
    CREATE POLICY existing_buckets ON storage.buckets TO PUBLIC USING(true) WITH CHECK(true);
    SET wellbeing.approved_hosted_ref='bofoowyzlnfhwcstlmgp';
  `);
  await db.exec(await readFile("deployment/hosted/storage-role.sql", "utf8"));
  await db.exec(`INSERT INTO storage.buckets(id,public) VALUES('assessment-reports',false),('existing-team-bucket',false);
    INSERT INTO storage.objects VALUES('existing-team-bucket','existing.txt');`);
});
afterAll(async () => { await db.close(); });

it("allows scoped create/read while denying other buckets despite permissive PUBLIC policies", async () => {
  await db.exec("SET ROLE wb_report_storage");
  await db.query("INSERT INTO storage.objects VALUES('assessment-reports',$1)", [path]);
  expect((await db.query("SELECT * FROM storage.objects")).rows).toEqual([{ bucket_id: "assessment-reports", name: path }]);
  await expect(db.exec("INSERT INTO storage.objects VALUES('existing-team-bucket','forbidden.txt')")).rejects.toThrow();
  await expect(db.exec("INSERT INTO storage.objects VALUES('assessment-reports','invalid.txt')")).rejects.toThrow();
  await db.exec("RESET ROLE");
});
it("prevents overwrite, deletion and bucket mutations even with PUBLIC grants", async () => {
  await db.exec("SET ROLE wb_report_storage");
  await db.exec("UPDATE storage.objects SET name='replaced.pdf'; DELETE FROM storage.objects;");
  expect((await db.query("SELECT name FROM storage.objects")).rows).toEqual([{ name: path }]);
  await expect(db.query("INSERT INTO storage.objects VALUES('assessment-reports',$1)", [path])).rejects.toThrow();
  await expect(db.exec("UPDATE storage.buckets SET public=true WHERE id='assessment-reports'")).rejects.toThrow();
  await db.exec("DELETE FROM storage.buckets");
  expect((await db.query("SELECT id,public FROM storage.buckets")).rows).toEqual([{ id: "assessment-reports", public: false }]);
  await db.exec("RESET ROLE");
});
it.each(["anon", "authenticated"])("blocks %s from reports while preserving existing bucket access", async role => {
  await db.exec(`SET ROLE ${role}`);
  expect((await db.query("SELECT bucket_id FROM storage.objects")).rows).toEqual([{ bucket_id: "existing-team-bucket" }]);
  await expect(db.query("INSERT INTO storage.objects VALUES('assessment-reports',$1)", [path])).rejects.toThrow();
  expect((await db.query("SELECT id FROM storage.buckets")).rows).toEqual([{ id: "existing-team-bucket" }]);
  await db.exec("RESET ROLE");
});

it("runs the metadata-only script in READ ONLY and classifies the two preserved baselines", async () => {
  await db.exec(`CREATE TABLE public._prisma_migrations(migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz)`);
  const manifest = JSON.parse(await readFile("deployment/hosted/migrations.json", "utf8"));
  for (const migration of manifest.migrations.filter((m: { action: string }) => m.action === "preserve-applied")) {
    await db.query("INSERT INTO public._prisma_migrations VALUES($1,$2,now(),NULL)", [migration.name, migration.sha256]);
  }
  const result = await db.exec(await readFile("deployment/hosted/metadata-readonly.sql", "utf8"));
  const rows = result.flatMap(r => r.rows) as Array<Record<string, unknown>>;
  expect(rows.some(r => r.read_only === "on")).toBe(true);
  expect(rows.filter(r => r.review === "PASS_BASELINE")).toHaveLength(2);
  expect(rows.filter(r => r.review === "PASS_PENDING")).toHaveLength(6);
});

it("flags ledger checksum drift without resolving or modifying the entry", async () => {
  await db.exec("UPDATE public._prisma_migrations SET checksum='synthetic-drift' WHERE migration_name='20261021144827_init_users'");
  const result = await db.exec(await readFile("deployment/hosted/metadata-readonly.sql", "utf8"));
  const rows = result.flatMap(r => r.rows) as Array<Record<string, unknown>>;
  expect(rows.filter(r => r.review === "BLOCKED_DRIFT_OR_FAILED_MIGRATION")).toHaveLength(1);
  expect((await db.query("SELECT checksum FROM public._prisma_migrations WHERE migration_name='20261021144827_init_users'")).rows).toEqual([{ checksum: "synthetic-drift" }]);
});
