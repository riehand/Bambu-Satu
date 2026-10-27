import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ claims: null as null | { sub: string }, refresh: false, requestCookies: [] as { name: string; value: string }[] }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { getAll: () => { name: string; value: string }[]; setAll: (cookies: unknown[], headers: Record<string, string>) => void } }) => ({
    auth: { getClaims: async () => {
      if (state.refresh) options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }], { "Cache-Control": "private, no-store" });
      state.requestCookies = options.cookies.getAll();
      return { data: { claims: state.claims }, error: null };
    } },
  }),
}));
import { proxy } from "@/proxy";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  state.claims = null;
  state.refresh = false;
});

it("redirects an unverified protected request", async () => {
  const response = await proxy(new NextRequest("http://localhost:3000/admin/dashboard"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/auth/login");
});
it("does not redirect login, avoiding inactive/profile redirect loops", async () => {
  const response = await proxy(new NextRequest("http://localhost:3000/auth/login?reason=inactive"));
  expect(response.headers.get("location")).toBeNull();
});
it("persists refreshed cookies to both server request and browser response", async () => {
  state.claims = { sub: "verified-id" };
  state.refresh = true;
  const response = await proxy(new NextRequest("http://localhost:3000/participant/dashboard"));
  expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  expect(state.requestCookies).toContainEqual({ name: "sb-test-auth-token", value: "refreshed" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});
it("preserves refresh cookies and cache headers when redirecting", async () => {
  state.refresh = true;
  const response = await proxy(new NextRequest("http://localhost:3000/participant/dashboard"));
  expect(response.headers.get("location")).toContain("/auth/login");
  expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  expect(response.headers.get("cache-control")).toContain("no-store");
});
