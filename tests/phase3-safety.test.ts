import { expect, it } from "vitest";
import { assertPhase3RehearsalEnvironment } from "../scripts/phase3-safety.mjs";

const databaseUrl = "postgresql://postgres:synthetic@127.0.0.1:54000/wellbeing_phase3_rehearsal?connection_limit=8";
const safeEnvironment = {
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  PHASE3_REHEARSAL_APPROVED: "synthetic-local-only",
  PHASE3_REHEARSAL_TOKEN: "a".repeat(32),
  PHASE3_REHEARSAL_PORT: "54000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  NODE_ENV: "test" as const,
};

it("accepts only the explicitly marked synthetic local Phase 3 target", () => {
  expect(() => assertPhase3RehearsalEnvironment(safeEnvironment)).not.toThrow();
});

it.each([
  { ...safeEnvironment, DATABASE_URL: databaseUrl.replace("127.0.0.1", "db.example.supabase.co") },
  { ...safeEnvironment, DIRECT_URL: "postgresql://different-target" },
  { ...safeEnvironment, PHASE3_REHEARSAL_APPROVED: "" },
  { ...safeEnvironment, PHASE3_REHEARSAL_PORT: "5432" },
  { ...safeEnvironment, SUPABASE_SERVICE_ROLE_KEY: "unexpected" },
])("rejects an unsafe or inconsistent target", (env) => {
  expect(() => assertPhase3RehearsalEnvironment(env)).toThrow(/isolated local synthetic PostgreSQL/);
});
