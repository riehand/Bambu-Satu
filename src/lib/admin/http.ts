import "server-only";
import { gatewayMode, hasDatabaseRequest } from "@/lib/dal/context";
import { withApplicationDatabase } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requireApiRole } from "@/lib/auth/session";
import { isSameOrigin, privateHeaders } from "@/lib/auth/http";
import { AdminError } from "./errors";
export async function adminApi(work: (id: string) => Promise<unknown>, request?: Request): Promise<NextResponse> {
  try {
    if (gatewayMode() && !hasDatabaseRequest()) return await withApplicationDatabase(()=>adminApi(work,request));
    const profile = await requireApiRole("SUPERADMIN");
    if (request && !isSameOrigin(request)) throw new AdminError("INVALID_ORIGIN", "Permintaan tidak diizinkan.", 403);
    return NextResponse.json({ success: true, data: await work(profile.id) }, { headers: privateHeaders });
  } catch (error) {
    const safe = error instanceof AdminError ? error : error instanceof AuthError
      ? new AdminError("UNAUTHORIZED", "Akses administrator aktif diperlukan.", error.reason === "unauthenticated" ? 401 : 403)
      : error instanceof ZodError || error instanceof SyntaxError ? new AdminError("VALIDATION_ERROR", "Data atau filter tidak valid.", 422)
      : new AdminError("ADMIN_UNAVAILABLE", "Data operasional belum dapat dimuat. Silakan coba lagi.", 503);
    return NextResponse.json({ success: false, error: { code: safe.code, message: safe.message } }, { status: safe.status, headers: privateHeaders });
  }
}
export function adminQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new AdminError("VALIDATION_ERROR", "Parameter berulang tidak diizinkan.", 422);
  return Object.fromEntries(params);
}
export async function adminJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("INVALID_CONTENT_TYPE", "Gunakan JSON.", 415);
  const body = await request.text();
  if (body.length > 2000) throw new AdminError("REQUEST_TOO_LARGE", "Permintaan terlalu besar.", 413);
  return JSON.parse(body) as unknown;
}
