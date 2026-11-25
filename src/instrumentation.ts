// Only an explicitly configured isolated browser-test stack installs the prototype.
export async function register() {
  if (!process.env.WELLBEING_LOCAL_RUNTIME_FILE) return;
  if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") throw new Error("LOCAL_DAL_ONLY");
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installLocalBrowserRuntime } = await import("@/lib/dal/local-bootstrap");
    await installLocalBrowserRuntime();
  }
}
