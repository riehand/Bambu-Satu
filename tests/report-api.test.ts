import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(), getCurrentProfile: vi.fn(), sameOrigin: vi.fn(),
  generate: vi.fn(), getReportArtifactForActor: vi.fn(), confirmReportDownloadAccess: vi.fn(), getValidatedReportArtifact: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireApiRole: mocks.requireApiRole,
  getCurrentProfile: mocks.getCurrentProfile,
  AuthError: class AuthError extends Error { constructor(readonly reason: string) { super(reason); } },
}));
vi.mock("@/lib/auth/http", () => ({ privateHeaders: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Expires: "0" }, isSameOrigin: mocks.sameOrigin }));
vi.mock("@/lib/appointments/service", () => ({
  AppointmentError: class AppointmentError extends Error { constructor(readonly code: string, message: string, readonly status: number) { super(message); } },
  getReportArtifactForActor: mocks.getReportArtifactForActor,
  confirmReportDownloadAccess: mocks.confirmReportDownloadAccess,
}));
vi.mock("@/lib/reports/service", () => ({
  ReportError: class ReportError extends Error { constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds?: number) { super(code); } },
  generateReportForParticipant: mocks.generate,
  getValidatedReportArtifact: mocks.getValidatedReportArtifact,
}));

import { AppointmentError } from "@/lib/appointments/service";
import { ReportError } from "@/lib/reports/service";
import { POST as generatePost } from "@/app/api/reports/[reportId]/generate/route";
import { GET as downloadGet } from "@/app/api/reports/[reportId]/download/route";

const origin = "https://app.test";
const reportId = "00000000-0000-4000-8000-000000000601";
const participantId = "00000000-0000-4000-8000-000000000602";
const psychologistId = "00000000-0000-4000-8000-000000000603";
const report = { id: reportId, status: "GENERATED", filePathOrObjectKey: `reports/${reportId}.pdf`, generatedAt: new Date() };
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
const context = { params: Promise.resolve({ reportId }) };
const request = (path: string, method: string, requestOrigin = origin) => new Request(`${origin}${path}`, { method, headers: { origin: requestOrigin } });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SITE_URL = origin;
  mocks.sameOrigin.mockImplementation((req: Request) => req.headers.get("origin") === origin);
  mocks.requireApiRole.mockResolvedValue({ id: participantId, role: "PARTICIPANT" });
  mocks.getCurrentProfile.mockResolvedValue({ id: participantId, role: "PARTICIPANT" });
  mocks.generate.mockResolvedValue({ reportId, status: "GENERATED" });
  mocks.getReportArtifactForActor.mockResolvedValue(report);
  mocks.confirmReportDownloadAccess.mockResolvedValue(undefined);
  mocks.getValidatedReportArtifact.mockResolvedValue(pdfBytes);
});

it("generates only for an authenticated participant from a same-origin request and returns no storage metadata", async () => {
  const response = await generatePost(request(`/api/reports/${reportId}/generate`, "POST"), context);
  expect(response.status).toBe(200);
  expect(mocks.requireApiRole).toHaveBeenCalledWith("PARTICIPANT");
  expect(mocks.generate).toHaveBeenCalledWith(participantId, reportId);
  const body = await response.text();
  expect(body).toContain('"status":"GENERATED"');
  expect(body).not.toContain("filePathOrObjectKey");
  expect(body).not.toContain("SUPABASE_SECRET_KEY");
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("rejects cross-origin and malformed generation requests before calling the service", async () => {
  expect((await generatePost(request(`/api/reports/${reportId}/generate`, "POST", "https://outside.test"), context)).status).toBe(403);
  const malformed = await generatePost(request("/api/reports/not-a-uuid/generate", "POST"), { params: Promise.resolve({ reportId: "not-a-uuid" }) });
  expect(malformed.status).toBe(422);
  expect(mocks.generate).not.toHaveBeenCalled();
});

it("returns safe retry timing for a throttled participant request", async () => {
  mocks.generate.mockRejectedValueOnce(new ReportError("REPORT_GENERATION_RATE_LIMITED", 429, 8));
  const response = await generatePost(request(`/api/reports/${reportId}/generate`, "POST"), context);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("8");
  expect(await response.text()).not.toContain("SUPABASE_SECRET_KEY");
});

it("streams a participant-owned PDF as a private no-store attachment", async () => {
  const response = await downloadGet(request(`/api/reports/${reportId}/download`, "GET"), context);
  expect(response.status).toBe(200);
  expect(mocks.getReportArtifactForActor).toHaveBeenCalledWith(participantId, "PARTICIPANT", reportId);
  expect(mocks.confirmReportDownloadAccess).toHaveBeenCalledWith(participantId, "PARTICIPANT", reportId);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe(`attachment; filename="hasil-asesmen-${reportId}.pdf"`);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
});

it("uses the current psychologist authorization path and stops before Storage when consent is denied", async () => {
  mocks.getCurrentProfile.mockResolvedValue({ id: psychologistId, role: "PSYCHOLOGIST" });
  await downloadGet(request(`/api/reports/${reportId}/download`, "GET"), context);
  expect(mocks.getReportArtifactForActor).toHaveBeenCalledWith(psychologistId, "PSYCHOLOGIST", reportId);
  expect(mocks.confirmReportDownloadAccess).toHaveBeenCalledWith(psychologistId, "PSYCHOLOGIST", reportId);

  mocks.getReportArtifactForActor.mockRejectedValueOnce(new AppointmentError("REPORT_ACCESS_DENIED", "Akses ditolak.", 403));
  const denied = await downloadGet(request(`/api/reports/${reportId}/download`, "GET"), context);
  expect(denied.status).toBe(403);
  expect(mocks.getValidatedReportArtifact).toHaveBeenCalledTimes(1);
});
