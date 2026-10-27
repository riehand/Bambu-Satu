import "server-only";

export type RegistrationStage =
  | "SITE_URL_RESOLUTION"
  | "REQUEST_VALIDATION"
  | "PRISMA_PREFLIGHT"
  | "SUPABASE_CLIENT_INITIALIZATION"
  | "SUPABASE_SIGNUP"
  | "RESPONSE_GENERATION";

const safeNames = new Set([
  "Error", "TypeError", "SyntaxError", "ConfigurationError",
  "PrismaClientInitializationError", "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError", "PrismaClientValidationError",
  "PrismaClientRustPanicError", "AuthApiError", "AuthRetryableFetchError",
  "AuthUnknownError", "AuthWeakPasswordError",
]);
const safeCodes = new Set([
  "SITE_URL_MISSING", "SITE_URL_INVALID", "SUPABASE_URL_MISSING", "SUPABASE_KEY_MISSING",
  "user_already_exists", "email_exists", "weak_password", "email_address_invalid",
  "email_address_not_authorized", "signup_disabled", "validation_failed",
  "unexpected_failure", "over_email_send_rate_limit", "over_request_rate_limit",
  "request_timeout", "hook_timeout", "hook_timeout_after_retry", "hook_payload_invalid_content_type",
  "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "ENOTFOUND", "ETIMEDOUT",
]);

function safeCode(value: unknown) {
  return typeof value === "string" && (safeCodes.has(value) || /^P\d{4}$/.test(value)) ? value : undefined;
}

export function logRegistrationFailure(stage: RegistrationStage, error: unknown) {
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const name = typeof details.name === "string" && safeNames.has(details.name) ? details.name : "UnknownError";
  const code = safeCode(details.code) ?? safeCode(details.errorCode) ?? "UNKNOWN";
  const status = typeof details.status === "number" && Number.isInteger(details.status) && details.status >= 400 && details.status <= 599
    ? details.status : undefined;
  // Prisma sometimes omits errorCode for pooler authentication errors. Match
  // only known diagnostics and emit a fixed category, never the original text.
  const prismaReason = stage === "PRISMA_PREFLIGHT" && typeof details.message === "string"
    ? /authentication failed|password authentication failed/i.test(details.message) ? "DATABASE_AUTHENTICATION_REJECTED"
      : /can't reach database|cannot reach database|network is unreachable|connection refused/i.test(details.message) ? "DATABASE_UNREACHABLE"
      : ["P2021", "P2022"].includes(code) ? "DATABASE_SCHEMA_MISMATCH"
      : "UNKNOWN"
    : null;

  // Construct an allowlisted record. Never pass the exception, message, stack,
  // cause, request, metadata, connection URL, or any credential to the logger.
  console.error("[auth.register]", {
    event: "registration_failure", stage, errorName: name, errorCode: code,
    ...(status === undefined ? {} : { status }),
    configurationPresent: {
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      siteUrl: Boolean(process.env.SITE_URL),
      databaseUrl: Boolean(process.env.DATABASE_URL),
      directUrl: Boolean(process.env.DIRECT_URL),
    },
    prismaFailure: stage === "PRISMA_PREFLIGHT"
      ? name === "PrismaClientInitializationError" ? "initialization" : "query"
      : null,
    prismaReason,
  });
}
