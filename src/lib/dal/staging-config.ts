import "server-only";

export function stagingProject(env: Record<string, string | undefined> = process.env) {
  const ref = env.WELLBEING_STAGING_PROJECT_REF;
  if (env.WELLBEING_RUNTIME !== "staging" || env.VERCEL_ENV === "production"
    || env.WELLBEING_LOCAL_RUNTIME_FILE || !ref || !/^[a-z0-9]{20}$/.test(ref)
    || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) throw new Error("STAGING_TARGET_REQUIRED");
  return { ref, url: `https://${ref}.supabase.co`, audience: `wellbeing-staging-${ref}-v1` };
}

export function httpsService(value: string | undefined) {
  const url = new URL(value ?? "");
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/"
    || url.search || url.hash || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname)
    || /(?:^|\.)(localhost|local|internal|test|invalid)$|^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) throw new Error("HTTPS_SERVICE_REQUIRED");
  return url;
}

export function stagingDatabase(value: string | undefined, role: "website_runtime" | "wb_pdf_worker", ref: string) {
  const url = new URL(value ?? "");
  const direct = url.hostname === `db.${ref}.supabase.co` && url.username === role;
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && url.username === `${role}.${ref}`;
  if (url.protocol !== "postgresql:" || (!direct && !pooler) || url.pathname !== "/postgres"
    || !url.password || url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict"
    || (url.port && !["5432", "6543"].includes(url.port))) throw new Error("RESTRICTED_STAGING_DATABASE_REQUIRED");
  return url.href;
}
