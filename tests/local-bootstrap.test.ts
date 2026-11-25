import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readFile: vi.fn(), install: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/dal/context", () => ({ installLocalRuntime: mocks.install }));
import { installLocalBrowserRuntime } from "@/lib/dal/local-bootstrap";
const config = { url: "postgresql://website_runtime:synthetic@127.0.0.1:50244/wellbeing_phase3_rehearsal", marker: "a".repeat(32), signingKey: "b".repeat(64) };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", "synthetic-local-fixture.json");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:50243");
  mocks.readFile.mockResolvedValue(JSON.stringify(config));
});
afterEach(() => vi.unstubAllEnvs());
it.each(["test", "development"])("installs explicit %s local fixture through the existing validated installer", async mode => {
  vi.stubEnv("NODE_ENV", mode);
  await installLocalBrowserRuntime();
  expect(mocks.install).toHaveBeenCalledWith(config.url, config.marker, expect.any(Function));
  expect(await mocks.install.mock.calls[0][2]("synthetic claim")).toMatch(/^[a-f0-9]{64}$/);
});
it("rejects production before reading keys or connecting", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(installLocalBrowserRuntime()).rejects.toThrow("LOCAL_DAL_ONLY");
  expect(mocks.readFile).not.toHaveBeenCalled(); expect(mocks.install).not.toHaveBeenCalled();
});
it("rejects implicit activation without a local fixture", async () => {
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", undefined);
  await expect(installLocalBrowserRuntime()).rejects.toThrow("LOCAL_DAL_ONLY");
  expect(mocks.readFile).not.toHaveBeenCalled();
});
it.each(["https://hosted.example.invalid", "http://example.invalid", "https://127.0.0.1:50243"])("rejects nonlocal Auth configuration %s", async url => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  await expect(installLocalBrowserRuntime()).rejects.toThrow("LOCAL_AUTH_ONLY");
  expect(mocks.install).not.toHaveBeenCalled();
});
it("fails startup when the runtime installer rejects the connection", async () => {
  mocks.install.mockRejectedValue(new Error("RUNTIME_UNAVAILABLE"));
  await expect(installLocalBrowserRuntime()).rejects.toThrow("RUNTIME_UNAVAILABLE");
  expect(mocks.install).toHaveBeenCalledOnce();
});
