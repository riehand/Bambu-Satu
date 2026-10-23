import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validations/auth";
import { getSiteUrl, jsonError, privateHeaders } from "@/lib/auth/http";
import { logRegistrationFailure, type RegistrationStage } from "@/lib/auth/registration-diagnostics";

const pendingMessage = "Jika pendaftaran dapat diproses, periksa email Anda untuk konfirmasi. Jika sudah memiliki akun, silakan masuk. Periksa folder spam atau hubungi pengelola jika email belum diterima.";

export async function POST(request: Request) {
  let stage: RegistrationStage = "SITE_URL_RESOLUTION";
  try {
    // Resolve once for both CSRF and email redirect; never trust Host as a fallback.
    const siteUrl = getSiteUrl();
    if (request.headers.get("origin") !== siteUrl) return jsonError("Permintaan tidak diizinkan.", 403);
    stage = "REQUEST_VALIDATION";
    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0].message, 400);
    const input = parsed.data;
    // Public preflight exposes only institutional-ID availability. The trigger's
    // UNIQUE constraint remains authoritative under concurrent registrations.
    stage = "PRISMA_PREFLIGHT";
    const existing = await prisma.user.findUnique({
      where: { institutionalId: input.institutionalId }, select: { id: true },
    });
    if (existing) return jsonError("NIM/NIP sudah digunakan. Jika sudah mendaftar, silakan masuk atau hubungi pengelola.", 409);
    stage = "SUPABASE_CLIENT_INITIALIZATION";
    const supabase = await createClient();
    stage = "SUPABASE_SIGNUP";
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/confirm`,
        data: {
          full_name: input.fullName, user_type: input.userType,
          institutional_id: input.institutionalId, phone_number: input.phoneNumber,
        },
      },
    });
    if (error) {
      if (["user_already_exists", "email_exists"].includes(error.code ?? "")) {
        return NextResponse.json({ success: true, message: pendingMessage }, { status: 202, headers: privateHeaders });
      }
      logRegistrationFailure(stage, error);
      if (error.status === 429) return jsonError("Terlalu banyak percobaan. Silakan coba lagi nanti.", 429);
      if (error.code === "weak_password") return jsonError("Password belum memenuhi kebijakan keamanan. Gunakan password yang lebih kuat.", 400);
      if (["email_address_invalid", "validation_failed"].includes(error.code ?? "")) return jsonError("Data pendaftaran belum valid. Periksa kembali informasi Anda.", 400);
      return jsonError("Pendaftaran belum dapat diproses. Periksa data, gunakan NIM/NIP Anda sendiri, atau coba lagi nanti. Jika sudah mendaftar, silakan masuk.", 503);
    }
    stage = "RESPONSE_GENERATION";
    return NextResponse.json({
      success: true,
      message: data.session ? "Pendaftaran diproses. Silakan masuk untuk melanjutkan." : pendingMessage,
    }, { status: 202, headers: privateHeaders });
  } catch (error) {
    logRegistrationFailure(stage, error);
    const status = stage === "REQUEST_VALIDATION" || stage === "RESPONSE_GENERATION" ? 500 : 503;
    return jsonError("Layanan pendaftaran sedang tidak tersedia. Silakan coba lagi nanti.", status);
  }
}
