import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import { dashboardPaths } from "@/lib/auth/roles";
import { isSameOrigin, jsonError, privateHeaders } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak diizinkan.", 403);
    const parsed = loginSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Email dan password wajib diisi dengan benar.", 400);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      if (error.code === "email_not_confirmed") return jsonError("Konfirmasi email Anda sebelum masuk.", 403);
      if (error.status === 429) return jsonError("Terlalu banyak percobaan. Silakan coba lagi nanti.", 429);
      if (!error.status || error.status >= 500) return jsonError("Layanan masuk sedang tidak tersedia. Coba lagi nanti.", 503);
      return jsonError("Email atau password tidak valid.", 401);
    }
    try {
      const profile = await getCurrentProfile();
      return NextResponse.json({ success: true, redirectTo: dashboardPaths[profile.role] }, { headers: privateHeaders });
    } catch (error) {
      await supabase.auth.signOut({ scope: "local" });
      if (error instanceof AuthError) {
        const message = error.reason === "inactive" ? "Akun Anda tidak aktif. Hubungi pengelola." : "Profil akun belum tersedia atau belum terverifikasi. Hubungi pengelola.";
        return jsonError(message, 403);
      }
      return jsonError("Profil belum dapat dimuat. Coba lagi nanti.", 503);
    }
  } catch {
    return jsonError("Layanan masuk sedang tidak tersedia. Silakan coba lagi nanti.", 503);
  }
}
