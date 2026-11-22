import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const history = [
  ["20261021144827_init_users", "1847814270d05a8411a3c63de8121639e8bc8b4ea4436635c451ee1cb6d15b59"],
  ["20261023000000_supabase_auth", "c5272ddb6fdd9624848d69bbeeb05fa5a4912d9a077264b21aaf20451b16622b"],
  ["20261023010000_phase2_assessment", "6befc228490a50bcc3fb411905fa7c5e0790066f2118a6de94a22bfdb77d3823"],
  ["20261028000000_psychologist_profiles", "4234dfcb585836426079f21e2b1bb9af180bb9c85d7f60ffcbcc7bd7adf69010"],
  ["20261029000000_psychologist_availability", "4f65c7aeb4ab586e5ff29f7905caadfaec10da1b285ef62d775c287604494ccb"],
  ["20261029000001_appointments_report_consent", "ad37a1fa0e8d6a97ef1c35d8a67f9067a0b6438f7ab5279d86473d4c984f93f3"],
];
const sql = (name: string) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const correction = sql("20261120000000_psychologist_profiles_integrity");
const hardening = readFileSync("docs/sql/stage2b3/02-ledger-remediation.sql", "utf8");
const recovery = readFileSync("docs/sql/stage2b3/04-ledger-recovery.sql", "utf8");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
let db: PGlite;
let owner: string;

it.each(history)("preserves historical checksum %s", (name, hash) => {
  expect(createHash("sha256").update(readFileSync(`prisma/migrations/${name}/migration.sql`)).digest("hex")).toBe(hash);
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE deployer_probe;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;`);
  for (const [name] of history) await db.exec(sql(name));
  for (const n of [1,2,3]) await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,$3::jsonb)", [id(n), `synthetic-${n}@example.test`, JSON.stringify({ full_name: "Synthetic profile", user_type: "STUDENT", institutional_id: `C4TEST${n}`, phone_number: "08000000000" })]);
  await db.exec(`CREATE SCHEMA chatbot; CREATE TABLE chatbot._backend_migrations(id text PRIMARY KEY); INSERT INTO chatbot._backend_migrations VALUES ('synthetic');
    CREATE TABLE public._prisma_migrations(id text PRIMARY KEY,checksum text NOT NULL,migration_name text NOT NULL,logs text);
    GRANT ALL ON public._prisma_migrations TO anon,authenticated;
    GRANT SELECT(checksum),UPDATE(logs) ON public._prisma_migrations TO anon;
    GRANT SELECT(id) ON public._prisma_migrations TO PUBLIC;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public._prisma_migrations TO deployer_probe;`);
  owner = (await db.query<{ name: string }>("SELECT current_user AS name")).rows[0].name;
});
afterAll(async () => { await db?.close(); });

async function failsWithoutCommit(script: string, pattern: RegExp) {
  try { await expect(db.exec(script)).rejects.toThrow(pattern); }
  finally { await db.exec("ROLLBACK"); }
}

describe.sequential("C4 correction on the complete historical sequence", () => {
  it("rejects duplicate IDs before touching NULL arrays", async () => {
    await db.query("INSERT INTO public.psychologist_profiles(id,user_id,areas_of_focus,languages,updated_at) VALUES($1,$2,NULL,NULL,now()),($1,$3,ARRAY['valid'],ARRAY['id'],now())", [id(10),id(1),id(2)]);
    await failsWithoutCommit(correction,/duplicate profile IDs/);
    expect((await db.query("SELECT areas_of_focus,languages FROM public.psychologist_profiles WHERE user_id=$1",[id(1)])).rows).toEqual([{areas_of_focus:null,languages:null}]);
    await db.query("UPDATE public.psychologist_profiles SET id=$1 WHERE user_id=$2",[id(11),id(2)]);
  });
  it.each(["ARRAY['id',NULL]::text[]", "ARRAY[['id','en'],['fr','de']]::text[]", "'[0:1]={id,en}'::text[]"])("rejects unsupported array data %s without partial backfill", async (array) => {
    await db.query(`UPDATE public.psychologist_profiles SET languages=${array} WHERE user_id=$1`,[id(2)]);
    await failsWithoutCommit(correction,/unsupported profile array/);
    expect((await db.query("SELECT areas_of_focus FROM public.psychologist_profiles WHERE user_id=$1",[id(1)])).rows).toEqual([{areas_of_focus:null}]);
    await db.query("UPDATE public.psychologist_profiles SET languages=ARRAY['id'] WHERE user_id=$1",[id(2)]);
  });
  it("backfills only whole-column NULLs, preserving profile values, IDs, timestamps, FK, RLS and grants", async () => {
    const before = (await db.query<Record<string, unknown>>("SELECT * FROM public.psychologist_profiles ORDER BY user_id")).rows;
    const protection = (await db.query("SELECT relacl,relrowsecurity FROM pg_class WHERE oid='public.psychologist_profiles'::regclass")).rows;
    await db.exec(correction);
    expect((await db.query("SELECT * FROM public.psychologist_profiles ORDER BY user_id")).rows).toEqual(before.map(row => ({...row,areas_of_focus:row.areas_of_focus??[],languages:row.languages??[]})));
    expect((await db.query("SELECT relacl,relrowsecurity FROM pg_class WHERE oid='public.psychologist_profiles'::regclass")).rows).toEqual(protection);
    expect((await db.query("SELECT conname FROM pg_constraint WHERE conrelid='public.psychologist_profiles'::regclass AND contype='p'")).rows).toEqual([{conname:"psychologist_profiles_pkey"}]);
    await db.query("INSERT INTO public.psychologist_profiles(id,user_id,updated_at) VALUES($1,$2,now())",[id(12),id(3)]);
    expect((await db.query("SELECT areas_of_focus,languages FROM public.psychologist_profiles WHERE id=$1",[id(12)])).rows).toEqual([{areas_of_focus:[],languages:[]}]);
  });
  it("rejects later duplicate IDs, NULL arrays and nonexistent profile owners", async () => {
    await expect(db.query("UPDATE public.psychologist_profiles SET id=$1 WHERE id=$2",[id(10),id(12)])).rejects.toThrow(/unique/);
    for (const column of ["areas_of_focus","languages"]) await expect(db.exec(`UPDATE public.psychologist_profiles SET ${column}=NULL`)).rejects.toThrow(/not-null/);
    await expect(db.query("UPDATE public.psychologist_profiles SET user_id=$1 WHERE id=$2",[id(99),id(12)])).rejects.toThrow(/foreign key/);
  });
});

describe.sequential("narrow ledger remediation", () => {
  it("refuses remediation without an explicit review marker", async () => {
    await failsWithoutCommit(hardening,/requires reviewed/);
    expect((await db.query("SELECT has_table_privilege('anon','public._prisma_migrations','INSERT') AS allowed")).rows).toEqual([{allowed:true}]);
    await db.query("SELECT set_config('wellbeing.ledger_approval','reviewed-exact-ledger-only',false),set_config('wellbeing.ledger_owner',$1,false),set_config('wellbeing.ledger_deployer','deployer_probe',false)",[owner]);
  });
  it("rolls back if effective access survives through an inherited group", async () => {
    await db.exec("CREATE ROLE inherited_probe; GRANT SELECT ON public._prisma_migrations TO inherited_probe; GRANT inherited_probe TO anon;");
    await failsWithoutCommit(hardening,/Browser effective/);
    expect((await db.query("SELECT has_table_privilege('authenticated','public._prisma_migrations','INSERT') AS allowed")).rows).toEqual([{allowed:true}]);
    await db.exec("REVOKE inherited_probe FROM anon;");
  });
  it("rolls back for SET-only membership even without automatic inheritance", async () => {
    await db.exec("GRANT inherited_probe TO anon WITH INHERIT FALSE,SET TRUE;");
    await failsWithoutCommit(hardening,/Browser SET ROLE/);
    await db.exec("REVOKE inherited_probe FROM anon;");
  });
  it("removes table, PUBLIC and separate column grants while preserving deployer and chatbot ledger", async () => {
    await db.exec(hardening);
    expect((await db.query("SELECT has_table_privilege('anon','public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS t,has_any_column_privilege('anon','public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') AS c")).rows).toEqual([{t:false,c:false}]);
    for (const role of ["anon","authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT checksum FROM public._prisma_migrations")).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE public._prisma_migrations SET logs='synthetic' WHERE false")).rejects.toThrow(/permission denied/);
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE deployer_probe; INSERT INTO public._prisma_migrations VALUES('synthetic','synthetic','synthetic',NULL); UPDATE public._prisma_migrations SET logs='synthetic'; SELECT id FROM public._prisma_migrations; DELETE FROM public._prisma_migrations; RESET ROLE;");
    expect((await db.query("SELECT * FROM chatbot._backend_migrations")).rows).toEqual([{id:"synthetic"}]);
  });
  it("requires independent recovery approval and restores only deployer rights", async () => {
    await failsWithoutCommit(recovery,/Recovery requires/);
    await db.exec("REVOKE UPDATE ON public._prisma_migrations FROM deployer_probe; SET wellbeing.ledger_recovery_approval='reviewed-deployer-only-recovery';");
    await db.exec(recovery);
    expect((await db.query("SELECT has_table_privilege('deployer_probe','public._prisma_migrations','UPDATE') AS d,has_table_privilege('anon','public._prisma_migrations','UPDATE') AS a")).rows).toEqual([{d:true,a:false}]);
  });
});
