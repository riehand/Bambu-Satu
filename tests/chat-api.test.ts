import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), list: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentProfile: mocks.profile, requireApiRole: mocks.profile, AuthError: class extends Error { constructor(public reason: string) { super(reason); } } }));
vi.mock("@/lib/consultations/chat-service", () => ({ listChatMessages: mocks.list, sendChatMessage: mocks.send }));
import { GET, POST } from "@/app/api/consultations/[appointmentId]/messages/route";
import { AuthError } from "@/lib/auth/session";
const id = "00000000-0000-4000-8000-000000000001", actor = { id, role: "PARTICIPANT" };
const context = { params: Promise.resolve({ appointmentId: id }) };
const command = { clientMessageId: id, body: "synthetic" };
const request = (body: unknown = command, origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/consultations/${id}/messages`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); process.env.SITE_URL = "http://localhost:3000"; mocks.profile.mockResolvedValue(actor); mocks.list.mockResolvedValue({ items: [] }); mocks.send.mockResolvedValue({ message: { id } }); });
it("GET and POST use authenticated identity and no-store", async () => {
  const response = await GET(new Request(`http://localhost:3000/api/consultations/${id}/messages`), context);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store"); expect(mocks.list).toHaveBeenCalledWith(actor, id, { limit: 30 });
  expect((await POST(request(), context)).status).toBe(200); expect(mocks.send).toHaveBeenCalledWith(actor, id, command);
});
it.each(["senderId", "role", "createdAt", "status", "consultationSessionId", "reportId"])("rejects forged %s", async key => {
  expect((await POST(request({ ...command, [key]: id }), context)).status).toBe(422); expect(mocks.send).not.toHaveBeenCalled();
});
it.each([{ body: "missing key" }, { clientMessageId: "bad", body: "test" }, { ...command, body: [] }, { ...command, body: "a".repeat(2001) }])("rejects malformed payload %#", async body => { expect((await POST(request(body), context)).status).toBe(422); });
it.each(["unauthenticated", "inactive", "profile", "forbidden"] as const)("denies auth failure %s", async reason => {
  mocks.profile.mockRejectedValue(new AuthError(reason)); expect((await POST(request(), context)).status).toBe(reason === "unauthenticated" ? 401 : 403);
});
it("rejects Super Admin and cross-origin sends", async () => {
  expect((await POST(request(command, "https://attacker.test"), context)).status).toBe(403);
  mocks.profile.mockResolvedValue({ ...actor, role: "SUPERADMIN" }); expect((await POST(request(), context)).status).toBe(403); expect(mocks.send).not.toHaveBeenCalled();
});
it.each(["limit=51", "senderId=1", "before=x&after=y", "limit=1&limit=2"])("rejects query %s", async query => {
  expect((await GET(new Request(`http://localhost:3000/api/consultations/${id}/messages?${query}`), context)).status).toBe(422);
});
it("rejects malformed path and never exposes raw failures", async () => {
  expect((await POST(request(), { params: Promise.resolve({ appointmentId: "bad" }) })).status).toBe(422);
  mocks.send.mockRejectedValue(new Error("raw private query")); const response = await POST(request(), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("raw private query");
});
