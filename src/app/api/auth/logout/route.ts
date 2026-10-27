import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin, jsonError, privateHeaders } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak diizinkan.", 403);
    const supabase = await createClient();
    // Revoke this website session only; Chatbot has its own session.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return jsonError("Belum dapat keluar. Silakan coba lagi.", 503);
    return NextResponse.json({ success: true }, { headers: privateHeaders });
  } catch {
    return jsonError("Belum dapat keluar. Silakan coba lagi.", 503);
  }
}
