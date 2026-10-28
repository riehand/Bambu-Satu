import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const userMigration = readFileSync("prisma/migrations/20261021144827_init_users/migration.sql", "utf8");
const profileMigration = readFileSync("prisma/migrations/20261028000000_psychologist_profiles/migration.sql", "utf8");
const psychologistId = "00000000-0000-4000-8000-000000000001";
const anotherId = "00000000-0000-4000-8000-000000000002";
const profileId = "00000000-0000-4000-8000-000000000003";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await db.exec(userMigration);
  await db.exec(profileMigration);
  await db.query(`INSERT INTO users(id,full_name,email,password_hash,phone_number,role,updated_at) VALUES
    ($1,'Synthetic psychologist','psychologist@example.test','synthetic','000','PSYCHOLOGIST',now()),
    ($2,'Synthetic participant','participant@example.test','synthetic','000','PARTICIPANT',now())`, [psychologistId, anotherId]);
});
afterAll(async () => { await db?.close(); });

describe.sequential("additive psychologist profile migration", () => {
  it("creates the profile table with defaults and enables row level security", async () => {
    await db.query("INSERT INTO psychologist_profiles(id,user_id,updated_at) VALUES ($1,$2,now())", [profileId, psychologistId]);
    expect((await db.query("SELECT areas_of_focus,languages FROM psychologist_profiles WHERE user_id=$1", [psychologistId])).rows)
      .toEqual([{ areas_of_focus: [], languages: [] }]);
    expect((await db.query("SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='public.psychologist_profiles'::regclass")).rows)
      .toEqual([{ enabled: true }]);
    expect((await db.query("SELECT has_table_privilege('anon','public.psychologist_profiles','SELECT') AS allowed")).rows)
      .toEqual([{ allowed: false }]);
  });

  it("enforces one profile per canonical user and rejects nonexistent owners", async () => {
    await expect(db.query("INSERT INTO psychologist_profiles(id,user_id,updated_at) VALUES ($1,$2,now())", ["00000000-0000-4000-8000-000000000004", psychologistId])).rejects.toThrow(/unique/i);
    await expect(db.query("INSERT INTO psychologist_profiles(id,user_id,updated_at) VALUES ($1,$2,now())", ["00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000099"])).rejects.toThrow(/foreign key/i);
    expect((await db.query("SELECT count(*)::int AS count FROM psychologist_profiles")).rows).toEqual([{ count: 1 }]);
  });
});
