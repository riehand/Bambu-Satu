import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, getCurrentProfile, requireApiRole } from "@/lib/auth/session";
import { isSameOrigin, privateHeaders } from "@/lib/auth/http";
import type { AppRole } from "@/lib/auth/roles";
import { AppointmentError } from "./service";

type AppointmentRole = "PARTICIPANT" | "PSYCHOLOGIST" | "PARTY";

export async function appointmentApi(
  role: AppointmentRole,
  work: (actor: { id: string; role: AppRole }) => Promise<unknown>,
  request?: Request,
  mutation = false,
  successStatus = 200,
) {
  try {
    const actor = role === "PARTY"
      ? await getCurrentProfile()
      : await requireApiRole(role);
    if (role === "PARTY" && actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") {
      throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
    }
    if (mutation && request && !isSameOrigin(request)) {
      throw new AppointmentError("INVALID_ORIGIN", "Permintaan tidak diizinkan.", 403);
    }
    return NextResponse.json({ success: true, data: await work({ id: actor.id, role: actor.role }) }, { status: successStatus, headers: privateHeaders });
  } catch (error) {
    const safe = error instanceof AppointmentError
      ? error
      : error instanceof AuthError
        ? new AppointmentError(error.reason === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN", "Akses tidak diizinkan.", error.reason === "unauthenticated" ? 401 : 403)
        : error instanceof ZodError || error instanceof SyntaxError
          ? new AppointmentError("VALIDATION_ERROR", "Data permintaan tidak valid.", 422)
          : new AppointmentError("APPOINTMENT_UNAVAILABLE", "Layanan konsultasi belum dapat dimuat. Silakan coba lagi nanti.", 503);
    return NextResponse.json({ success: false, error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: privateHeaders });
  }
}

export async function readAppointmentJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new AppointmentError("INVALID_CONTENT_TYPE", "Gunakan format JSON.", 415);
  }
  const body = await request.text();
  if (body.length > 12000) throw new AppointmentError("REQUEST_TOO_LARGE", "Permintaan terlalu besar.", 413);
  return JSON.parse(body) as unknown;
}
