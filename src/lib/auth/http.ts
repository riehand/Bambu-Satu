import "server-only";
import { NextResponse } from "next/server";
import { ConfigurationError } from "@/lib/configuration-error";

export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: { message } }, { status, headers: privateHeaders });
}

export function getSiteUrl() {
  const value = process.env.SITE_URL;
  if (!value) throw new ConfigurationError("SITE_URL_MISSING");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError("SITE_URL_INVALID");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new ConfigurationError("SITE_URL_INVALID");
  }
  return url.origin;
}

// Login/logout CSRF protection. Do not derive the trusted origin from Host
// or forwarded headers. Mobile uses Supabase Auth directly, not these routes.
export function isSameOrigin(request: Request) {
  return request.headers.get("origin") === getSiteUrl();
}
