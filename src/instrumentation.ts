// Only an explicitly configured isolated browser-test stack installs the prototype.
export async function register() {
  if (process.env.WELLBEING_RUNTIME === "staging") {
    if (process.env.WELLBEING_LOCAL_RUNTIME_FILE || process.env.VERCEL_ENV === "production") throw new Error("STAGING_RUNTIME_REQUIRED");
    if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
      const { installStagingRuntime } = await import("@/lib/dal/hosted-bootstrap");
      await installStagingRuntime();
    }
    return;
  }
  if (!process.env.WELLBEING_LOCAL_RUNTIME_FILE) {
    if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development") {
      console.info("[WellBeing] Standard development: configured Supabase Auth/profile via session RLS. Clinical database/PDF features require an approved hosted restricted runtime; owner Prisma fallback is disabled. See docs/DEVELOPMENT-ENVIRONMENT-CONSOLIDATION.md.");
    }
    return;
  }
  if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") throw new Error("LOCAL_DAL_ONLY");
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installLocalBrowserRuntime } = await import("@/lib/dal/local-bootstrap");
    await installLocalBrowserRuntime();
  }
}
