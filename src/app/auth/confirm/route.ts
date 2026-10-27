import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, privateHeaders } from "@/lib/auth/http";

export async function GET(request: NextRequest) {
  // Read the request before configuration: this is a request-time handler,
  // including when Cache Components probes it during prerendering.
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const destination = new URL("/auth/login", getSiteUrl());
  destination.searchParams.set("reason", "confirmation");
  try {
    // Only email signup links; never use a caller-supplied redirect target.
    if (tokenHash && type === "email") {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
      if (!error) destination.search = "?notice=confirmed";
    }
  } catch {
    destination.search = "?reason=unavailable";
  }
  const response = NextResponse.redirect(destination, 303);
  Object.entries(privateHeaders).forEach(([name, value]) => response.headers.set(name, value));
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
