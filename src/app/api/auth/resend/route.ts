import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, isSameOrigin, jsonError, privateHeaders } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak diizinkan.", 403);
    const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Masukkan email yang valid.", 400);
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data.email, options: { emailRedirectTo: `${getSiteUrl()}/auth/confirm` } });
    if (error?.status === 429) return jsonError("Terlalu banyak percobaan. Silakan coba lagi nanti.", 429);
    if (error && (!error.status || error.status >= 500)) return jsonError("Layanan email sedang tidak tersedia. Coba lagi nanti.", 503);
    return NextResponse.json({ success: true, message: "Jika akun menunggu konfirmasi, email baru akan dikirim. Periksa folder spam. Jika sudah dikonfirmasi, silakan masuk." }, { status: 202, headers: privateHeaders });
  } catch {
    return jsonError("Layanan email sedang tidak tersedia. Coba lagi nanti.", 503);
  }
}
