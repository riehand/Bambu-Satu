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
  expect("DIRECT_URL" in values).toBe(false);
  expect(URL.canParse(values.DATABASE_URL ?? "")).toBe(true);
  const url = new URL(values.DATABASE_URL);
  expect(url.protocol === "postgresql:").toBe(true);
  expect(url.username === "website_runtime.YOUR_PROJECT_REF").toBe(true);
  expect(url.password === "YOUR_PASSWORD").toBe(true);
  expect(url.hostname === "YOUR_POOLER_HOST").toBe(true);
});
