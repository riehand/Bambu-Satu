export type ConfigurationErrorCode =
  | "SITE_URL_MISSING"
  | "SITE_URL_INVALID"
  | "SUPABASE_URL_MISSING"
  | "SUPABASE_KEY_MISSING";

export class ConfigurationError extends Error {
  constructor(public readonly code: ConfigurationErrorCode) {
    super(code === "SITE_URL_MISSING" ? "SITE_URL is missing" : "Authentication configuration is incomplete or invalid");
    this.name = "ConfigurationError";
  }
}
