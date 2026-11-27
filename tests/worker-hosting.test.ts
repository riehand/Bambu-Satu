import { expect, it } from "vitest";
import { workerListenHost } from "@/lib/reports/worker-hosting";

it("keeps unmanaged worker on loopback", () => {
  expect(workerListenHost({})).toBe("127.0.0.1");
  expect(workerListenHost({ RENDER: "true" })).toBe("127.0.0.1");
});
it("binds the managed interface only for explicit hosted Render deployment", () => {
  expect(workerListenHost({ WELLBEING_WORKER_HOSTING: "render", RENDER: "true", WELLBEING_RUNTIME: "hosted" })).toBe("0.0.0.0");
  for (const env of [
    { WELLBEING_WORKER_HOSTING: "render" },
    { WELLBEING_WORKER_HOSTING: "render", RENDER: "true", WELLBEING_RUNTIME: "staging" },
    { WELLBEING_WORKER_HOSTING: "unknown" },
  ]) expect(() => workerListenHost(env)).toThrow("WORKER_HOSTING_CONFIGURATION_REQUIRED");
});
