import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { assertRehearsalEnvironment, configuredSource, externalDirectory } from "../scripts/phase2-safety.mjs";

describe("finalization operation boundaries (no database writes)", () => {
  it.each(["phase2-backup.mjs", "phase2-rehearsal.mjs"])("%s defaults to preparation without reading hosted configuration", script => {
    const result = spawnSync(process.execPath, [`scripts/${script}`], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "DO_NOT_PRINT_SECRET" } });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Preparation only");
    expect(result.stdout + result.stderr).not.toContain("DO_NOT_PRINT_SECRET");
  });
  it("refuses backup storage inside the repository", () => {
    expect(() => externalDirectory(process.cwd())).toThrow("outside the repository");
    expect(() => externalDirectory("docs")).toThrow("absolute");
  });
  it("requires the matching hosted project and Session/direct connection", () => {
    expect(() => configuredSource("postgresql://postgres.project:synthetic@region.pooler.supabase.com:6543/postgres", "https://project.supabase.co")).toThrow();
    expect(() => configuredSource("postgresql://postgres.other:synthetic@region.pooler.supabase.com:5432/postgres", "https://project.supabase.co")).toThrow();
    expect(configuredSource("postgresql://postgres.project:synthetic@region.pooler.supabase.com:5432/postgres", "https://project.supabase.co").port).toBe("5432");
  });
  const local = "postgresql://postgres:synthetic@127.0.0.1:55432/wellbeing_phase2_rehearsal?connection_limit=8";
  const valid = { NODE_ENV: "test" as const, DATABASE_URL: local, DIRECT_URL: local, PHASE2_REHEARSAL_APPROVED: "synthetic-local-only",
    PHASE2_REHEARSAL_TOKEN: "a".repeat(32), NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55431",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" };
  it("accepts only the explicitly isolated environment", () => { expect(() => assertRehearsalEnvironment(valid)).not.toThrow(); });
  it.each([
    { DIRECT_URL: "postgresql://postgres:secret@db.project.supabase.co/postgres" },
    { DATABASE_URL: local.replace("127.0.0.1", "localhost") },
    { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
    { PHASE2_REHEARSAL_APPROVED: "" },
    { SUPABASE_SERVICE_ROLE_KEY: "DO_NOT_PRINT_SECRET" },
  ])("rejects inherited hosted credentials or an unapproved run %#", override => {
    expect(() => assertRehearsalEnvironment({ ...valid, ...override })).toThrow("Rehearsal refused");
  });
});
