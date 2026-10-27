import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requireApiRole } from "@/lib/auth/session";
import { isSameOrigin, privateHeaders } from "@/lib/auth/http";
import { AssessmentError } from "./errors";

export function publicAssessmentError(error: unknown) {
  if (error instanceof AssessmentError) return error;
  return new AssessmentError("ASSESSMENT_UNAVAILABLE", "Layanan asesmen belum dapat dimuat. Silakan coba lagi nanti.", 503);
}
export async function assessmentApi(work: (participantId: string) => Promise<unknown>, request?: Request) {
  try {
    const profile = await requireApiRole("PARTICIPANT");
    if (request && !isSameOrigin(request)) throw new AssessmentError("INVALID_ORIGIN", "Permintaan tidak diizinkan.", 403);
    const data = await work(profile.id);
    return NextResponse.json({ success: true, data }, { headers: privateHeaders });
  } catch (error) {
    let safe: AssessmentError;
    if (error instanceof AuthError) safe = new AssessmentError(error.reason === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN", "Akses peserta diperlukan.", error.reason === "unauthenticated" ? 401 : 403);
    else if (error instanceof ZodError || error instanceof SyntaxError) safe = new AssessmentError("VALIDATION_ERROR", "Data permintaan tidak valid.", 422);
    else safe = publicAssessmentError(error);
    // No request body, answers, user details or database error text is logged.
    return NextResponse.json({ success: false, error: { code: safe.code, message: safe.message } }, { status: safe.httpStatus, headers: privateHeaders });
  }
}
export async function readAssessmentJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AssessmentError("INVALID_CONTENT_TYPE", "Gunakan format JSON.", 415);
  const text = await request.text();
  if (text.length > 20000) throw new AssessmentError("REQUEST_TOO_LARGE", "Permintaan terlalu besar.", 413);
  return JSON.parse(text) as unknown;
}
