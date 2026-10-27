import { ConfigurationError } from "@/lib/configuration-error";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new ConfigurationError("SUPABASE_URL_MISSING");
  if (!key) throw new ConfigurationError("SUPABASE_KEY_MISSING");
  return { url, key };
}
