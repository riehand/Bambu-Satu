import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.each([
  "postgresql://placeholder:DO_NOT_PRINT_THIS@localhost:5432/placeholder",
  "malformed-DO_NOT_PRINT_THIS",
])("refuses mismatched or malformed configuration without leaking values %#", databaseUrl => {
  const result = spawnSync(process.execPath, ["scripts/auth-preflight.mjs"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co" },
    timeout: 10000,
  });
  expect(result.status).toBe(1);
  const output = result.stdout + result.stderr;
  expect(output.includes("DO_NOT_PRINT_THIS")).toBe(false);
  expect(output.includes('"inventory"')).toBe(false);
  expect(output.includes("Audit refused") || output.includes("Read-only audit failed")).toBe(true);
});

it.each([
  "postgresql://placeholder:DO_NOT_PRINT_THIS@localhost:5432/placeholder",
  "malformed-DO_NOT_PRINT_THIS",
])("assessment readiness refuses an invalid target without exposing credentials %#", databaseUrl => {
  const result = spawnSync(process.execPath, ["scripts/assessment-preflight.mjs"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co" },
    timeout: 10000,
  });
  expect(result.status).toBe(1);
  const output = result.stdout + result.stderr;
  expect(output).not.toContain("DO_NOT_PRINT_THIS");
  expect(output).not.toContain('"existingRelations"');
  expect(output).toContain("Read-only assessment review failed");
});
