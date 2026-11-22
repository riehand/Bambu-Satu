import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), transition: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentProfile: mocks.profile, requireApiRole: mocks.profile,
  AuthError: class extends Error { constructor(public reason: string) { super(reason); } } }));
vi.mock("@/lib/consultations/service", () => ({ transitionConsultation: mocks.transition, listConsultations: mocks.list }));
import { AuthError } from "@/lib/auth/session";
import { GET } from "@/app/api/consultations/route";
import { POST } from "@/app/api/consultations/[appointmentId]/[action]/route";
const id = "00000000-0000-4000-8000-000000000001";
const actor = { id, role: "PARTICIPANT" };
const request = (body: unknown = {}, action = "participant-check-in", origin = "http://localhost:3000", appointmentId = id) => POST(new Request(`http://localhost:3000/api/consultations/${appointmentId}/${action}`, {
  method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
}), { params: Promise.resolve({ appointmentId, action }) });
beforeEach(() => { vi.resetAllMocks(); process.env.SITE_URL = "http://localhost:3000"; mocks.profile.mockResolvedValue(actor); mocks.transition.mockResolvedValue({ appointmentId: id }); mocks.list.mockResolvedValue({ items: [] }); });
it("GET uses the verified actor and private no-store response", async () => {
  const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocks.list).toHaveBeenCalledWith(actor);
});
it("POST accepts only an empty command and passes authenticated identity", async () => {
  expect((await request()).status).toBe(200); expect(mocks.transition).toHaveBeenCalledWith(actor, id, "participant-check-in");
});
it.each(["participantId", "psychologistId", "role", "status", "startedAt", "endedAt", "timestamp"])("rejects forged %s", async key => {
  expect((await request({ [key]: "forged" })).status).toBe(422); expect(mocks.transition).not.toHaveBeenCalled();
});
it.each(["cancel", "reschedule", "no-show", "reopen", "update-status"])("does not expose policy-dependent action %s", async action => {
  expect((await request({}, action)).status).toBe(422); expect(mocks.transition).not.toHaveBeenCalled();
});
it("rejects malformed appointment ID", async () => { expect((await request({}, "start", "http://localhost:3000", "bad")).status).toBe(422); });
it("rejects cross-origin writes", async () => { expect((await request({}, "start", "https://attacker.test")).status).toBe(403); expect(mocks.transition).not.toHaveBeenCalled(); });
it.each(["unauthenticated", "inactive", "profile", "forbidden"] as const)("rejects auth failure %s", async reason => {
  mocks.profile.mockRejectedValue(new AuthError(reason)); expect((await request()).status).toBe(reason === "unauthenticated" ? 401 : 403); expect(mocks.transition).not.toHaveBeenCalled();
});
it("does not grant Super Admin consultation access", async () => {
  mocks.profile.mockResolvedValue({ id, role: "SUPERADMIN" }); expect((await GET()).status).toBe(403); expect((await request()).status).toBe(403);
});
it("never leaks raw database errors", async () => {
  mocks.transition.mockRejectedValue(new Error("SQL credential synthetic-private-detail")); const response = await request();
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-private-detail");
});
