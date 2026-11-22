import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), overview: vi.fn(), periods: vi.fn(), period: vi.fn(), create: vi.fn(), psychologists: vi.fn(), appointments: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.profile } } }));
vi.mock("@/lib/admin/service", () => ({ adminOverview: mocks.overview, adminPeriods: mocks.periods, adminPeriod: mocks.period, createInactivePeriod: mocks.create, adminPsychologists: mocks.psychologists, adminAppointments: mocks.appointments }));
import { GET as overview } from "@/app/api/admin/overview/route";
import { GET as periods, POST } from "@/app/api/admin/periods/route";
import { GET as detail } from "@/app/api/admin/periods/[periodId]/route";
import { GET as psychologists } from "@/app/api/admin/psychologists/route";
import { GET as appointments } from "@/app/api/admin/appointments/route";
import { GET as privateChat } from "@/app/api/consultations/[appointmentId]/messages/route";
import { GET as assessmentHistory } from "@/app/api/assessment/history/route";
import { GET as reportDownload } from "@/app/api/reports/[reportId]/download/route";
const id = "00000000-0000-4000-8000-000000000001", origin = "http://localhost:3000";
const payload = { name: "Periode sintetis", startDate: "2031-01-01", endDate: "2031-06-01", assessmentLimit: 3 };
const request = (path: string) => new Request(`${origin}/api/admin/${path}`);
const post = (body: unknown = payload, from = origin) => new Request(`${origin}/api/admin/periods`, { method: "POST", headers: { "content-type": "application/json", origin: from }, body: JSON.stringify(body) });
const reads = [() => overview(request("overview?from=2030-01-01&to=2030-01-31")), () => periods(request("periods")), () => detail(request(`periods/${id}`), { params: Promise.resolve({ periodId: id }) }), () => psychologists(request("psychologists?from=2030-01-01&to=2030-01-31")), () => appointments(request("appointments?from=2030-01-01&to=2030-01-31"))];
beforeEach(() => {
  vi.resetAllMocks(); process.env.SITE_URL = origin;
  mocks.getUser.mockResolvedValue({ data: { user: { id, email_confirmed_at: "2030-01-01", user_metadata: { role: "PARTICIPANT" } } }, error: null });
  mocks.profile.mockResolvedValue({ id, role: "SUPERADMIN", isActive: true });
  for (const name of ["overview", "periods", "period", "create", "psychologists", "appointments"] as const) mocks[name].mockResolvedValue({ items: [] });
});
it.each(["PARTICIPANT", "PSYCHOLOGIST"])("all admin routes reject %s despite forged JWT metadata", async role => {
  mocks.profile.mockResolvedValue({ id, role, isActive: true });
  mocks.getUser.mockResolvedValue({ data: { user: { id, email_confirmed_at: "2030-01-01", user_metadata: { role: "SUPERADMIN" } } }, error: null });
  for (const run of [...reads, () => POST(post())]) expect((await run()).status).toBe(403);
  expect(mocks.overview).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["inactive", "missing", "unconfirmed", "unauthenticated"])("denies %s identities on every endpoint", async condition => {
  if (condition === "inactive") mocks.profile.mockResolvedValue({ id, role: "SUPERADMIN", isActive: false });
  if (condition === "missing") mocks.profile.mockResolvedValue(null);
  if (condition === "unconfirmed") mocks.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  if (condition === "unauthenticated") mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
  for (const run of [...reads, () => POST(post())]) expect((await run()).status).toBe(["unconfirmed", "unauthenticated"].includes(condition) ? 401 : 403);
});
it("uses server-verified ID and no-store for all reads and creation", async () => {
  for (const run of [...reads, () => POST(post())]) {
    const response = await run(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("private, no-store");
  }
  expect(mocks.overview).toHaveBeenCalledWith(id, { from: "2030-01-01", to: "2030-01-31" }); expect(mocks.create).toHaveBeenCalledWith(id, payload);
});
it("rejects CSRF origin without executing mutation", async () => { expect((await POST(post(payload, "https://attacker.test"))).status).toBe(403); expect(mocks.create).not.toHaveBeenCalled(); });
it.each(["status", "role", "actorId", "id", "isActive"])("rejects forged creation field %s", async field => { expect((await POST(post({ ...payload, [field]: "ACTIVE" }))).status).toBe(422); expect(mocks.create).not.toHaveBeenCalled(); });
it.each(["from=2030-01-01&to=2030-01-31&participantId=1", "from=2030-01-01&to=2030-01-31&from=2030-01-02", "from=bad&to=bad", "from=2030-01-01&to=2030-12-31"])("rejects invalid or overly granular query %s", async query => expect((await overview(request(`overview?${query}`))).status).toBe(422));
it("validates detail path/query, content type and oversized bodies", async () => {
  expect((await detail(request("periods/bad"), { params: Promise.resolve({ periodId: "bad" }) })).status).toBe(422);
  expect((await detail(request(`periods/${id}?include=scores`), { params: Promise.resolve({ periodId: id }) })).status).toBe(422);
  expect((await POST(new Request(`${origin}/api/admin/periods`, { method: "POST", headers: { origin }, body: "{}" }))).status).toBe(415);
  expect((await POST(post({ ...payload, name: "x".repeat(3000) }))).status).toBe(413);
});
it("raw SQL errors are safe and responses remain no-store", async () => {
  mocks.overview.mockRejectedValue(new Error("secret raw query")); const response = await reads[0](); expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret"); expect(response.headers.get("cache-control")).toContain("no-store");
});
it("SUPERADMIN cannot read private chat, assessment history or PDF through existing routes", async () => {
  expect((await privateChat(new Request(`${origin}/api/consultations/${id}/messages`), { params: Promise.resolve({ appointmentId: id }) })).status).toBe(403);
  expect((await assessmentHistory()).status).toBe(403);
  expect((await reportDownload(new Request(`${origin}/api/reports/${id}/download`), { params: Promise.resolve({ reportId: id }) })).status).toBe(403);
});
