import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { privateHeaders } from "@/lib/auth/http";
import { AppointmentError } from "@/lib/appointments/service";
import { ReportError } from "./service";

export function reportErrorResponse(error: unknown) {
  const safe = error instanceof ReportError || error instanceof AppointmentError
    ? error
    : error instanceof AuthError
      ? { code: error.reason === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN", status: error.reason === "unauthenticated" ? 401 : 403 }
      : error instanceof ZodError
        ? { code: "VALIDATION_ERROR", status: 422 }
        : { code: "REPORT_UNAVAILABLE", status: 503 };
  const messages: Record<string, string> = {
    REPORT_NOT_FOUND: "Laporan tidak ditemukan.",
    REPORT_ACCESS_DENIED: "Akses ke laporan ini tidak diizinkan.",
    REPORT_NOT_GENERATED: "Laporan belum siap.",
    ASSESSMENT_NOT_COMPLETED: "Asesmen belum selesai.",
    REPORT_GENERATION_RATE_LIMITED: "Tunggu sebentar sebelum mencoba lagi.",
    UNAUTHORIZED: "Silakan masuk kembali.",
    FORBIDDEN: "Akses tidak diizinkan.",
    VALIDATION_ERROR: "Permintaan tidak valid.",
  };
  const headers = new Headers(privateHeaders);
  if (error instanceof ReportError && error.retryAfterSeconds) headers.set("Retry-After", String(error.retryAfterSeconds));
  return NextResponse.json(
    { success: false, error: { code: safe.code, message: messages[safe.code] ?? "Laporan belum dapat disiapkan. Silakan coba lagi nanti." } },
    { status: safe.status, headers },
  );
}
