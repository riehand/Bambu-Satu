/** @param {Record<string, string | undefined>} [env] */
export function assertPhase3RehearsalEnvironment(env = process.env) {
  try {
    const database = new URL(env.DATABASE_URL);
    const expectedPort = Number(env.PHASE3_REHEARSAL_PORT);
    if (env.PHASE3_REHEARSAL_APPROVED !== "synthetic-local-only"
      || !/^[a-f0-9]{32}$/.test(env.PHASE3_REHEARSAL_TOKEN ?? "")
      || env.DIRECT_URL !== env.DATABASE_URL
      || database.protocol !== "postgresql:"
      || database.hostname !== "127.0.0.1"
      || !Number.isInteger(expectedPort) || expectedPort < 49152 || expectedPort > 65535
      || Number(database.port) !== expectedPort
      || database.pathname !== "/wellbeing_phase3_rehearsal"
      || database.username !== "postgres"
      || database.search !== "?connection_limit=8"
      || env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55431"
      || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== ""
      || env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== ""
      || env.SUPABASE_SERVICE_ROLE_KEY !== ""
      || env.SUPABASE_SECRET_KEY !== "") throw 0;
  } catch {
    throw new Error("Phase 3 rehearsal refused: an isolated local synthetic PostgreSQL target is required.");
  }
}
