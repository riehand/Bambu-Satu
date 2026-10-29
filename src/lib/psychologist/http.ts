import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requireApiRole } from "@/lib/auth/session";
import { isSameOrigin, privateHeaders } from "@/lib/auth/http";
import { availabilityRangeSchema } from "@/lib/validations/availability";

export class PsychologistError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

type ApiResult = { data: unknown; meta?: unknown };

export async function psychologistApi(
  role: "PARTICIPANT" | "PSYCHOLOGIST",
  work: (actorId: string) => Promise<ApiResult>,
  request?: Request,
  mutation = false,
) {
  try {
    const actor = await requireApiRole(role);
    if (mutation && request && !isSameOrigin(request)) {
      throw new PsychologistError("INVALID_ORIGIN", "Permintaan tidak diizinkan.", 403);
    }
    return NextResponse.json({ success: true, ...await work(actor.id) }, { headers: privateHeaders });
  } catch (error) {
    const safe = error instanceof PsychologistError
      ? error
      : error instanceof AuthError
        ? new PsychologistError(error.reason === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN", "Akses tidak diizinkan.", error.reason === "unauthenticated" ? 401 : 403)
        : error instanceof ZodError || error instanceof SyntaxError
          ? new PsychologistError("VALIDATION_ERROR", "Data permintaan tidak valid.", 422)
          : new PsychologistError("PSYCHOLOGIST_UNAVAILABLE", "Layanan psikolog belum dapat dimuat. Silakan coba lagi nanti.", 503);
    return NextResponse.json({ success: false, error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: privateHeaders });
  }
}

export async function readPsychologistJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new PsychologistError("INVALID_CONTENT_TYPE", "Gunakan format JSON.", 415);
  }
  const body = await request.text();
  if (body.length > 12000) throw new PsychologistError("REQUEST_TOO_LARGE", "Permintaan terlalu besar.", 413);
  return JSON.parse(body) as unknown;
}

export function readAvailabilityRange(request: Request) {
  const params = new URL(request.url).searchParams;
  const entries = [...params.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new PsychologistError("VALIDATION_ERROR", "Parameter pencarian tidak valid.", 422);
  }
  return availabilityRangeSchema.parse(Object.fromEntries(entries));
}
