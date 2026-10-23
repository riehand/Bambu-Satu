import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps environment examples free of real credentials and project identifiers", () => {
  const example = readFileSync(".env.example", "utf8");
  const values = Object.fromEntries(example.split(/\r?\n/)
    .filter(line => line && !line.startsWith("#"))
    .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  // Assert booleans so even a failed test never prints the credential value.
  expect(values.NEXT_PUBLIC_SUPABASE_URL === "https://YOUR_PROJECT_REF.supabase.co").toBe(true);
  expect(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "sb_publishable_YOUR_PUBLIC_KEY").toBe(true);
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    const url = new URL(values[name]);
    expect(url.password === "YOUR_PASSWORD").toBe(true);
    expect(url.hostname === "YOUR_POOLER_HOST").toBe(true);
  }
});
