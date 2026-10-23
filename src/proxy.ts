import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { privateHeaders } from "@/lib/auth/http";

export async function proxy(request: NextRequest) {
  const { url, key } = getSupabaseConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const previousCookies = response.cookies.getAll();
        response = NextResponse.next({ request });
        previousCookies.forEach(cookie => response.cookies.set(cookie));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data, error } = await supabase.auth.getClaims();
  const protectedPage = /^\/(participant|psychologist|admin)(\/|$)/.test(request.nextUrl.pathname);
  if (protectedPage && (error || !data?.claims)) {
    const target = request.nextUrl.clone();
    target.pathname = "/auth/login";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    response = redirect;
  }
  Object.entries(privateHeaders).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}

export const config = {
  matcher: ["/participant/:path*", "/psychologist/:path*", "/admin/:path*", "/auth/:path*", "/api/auth/:path*"],
};
