import { realpathSync } from "node:fs";
import { relative, isAbsolute, sep } from "node:path";

// These guards do not confer authorization. The owner must approve the operation.
export function configuredSource(databaseUrl, supabaseUrl) {
  try {
    const db = new URL(databaseUrl), auth = new URL(supabaseUrl);
    const project = auth.hostname.endsWith(".supabase.co") ? auth.hostname.split(".")[0] : null;
    if (!project || !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.password || db.pathname !== "/postgres" || (db.port && db.port !== "5432") ||
      !(db.hostname === `db.${project}.supabase.co` ||
        (db.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(db.username).endsWith(`.${project}`)))) throw 0;
    return db;
  } catch { throw new Error("Source must be the configured Supabase direct or Session pooler database."); }
}

export function externalDirectory(directory, repository = process.cwd()) {
  if (!directory || !isAbsolute(directory)) throw new Error("An existing absolute protected directory is required.");
  const actual = realpathSync(directory), repo = realpathSync(repository);
  const rel = relative(repo, actual);
  if (!rel || (!(rel === ".." || rel.startsWith(`..${sep}`)) && !isAbsolute(rel))) throw new Error("Backups must be outside the repository.");
  return actual;
}

export function assertRehearsalEnvironment(env = process.env) {
  try {
    const db = new URL(env.DATABASE_URL);
    if (env.PHASE2_REHEARSAL_APPROVED !== "synthetic-local-only" ||
      !/^[a-f0-9]{32}$/.test(env.PHASE2_REHEARSAL_TOKEN ?? "") ||
      env.DIRECT_URL !== env.DATABASE_URL || db.protocol !== "postgresql:" ||
      db.hostname !== "127.0.0.1" || db.port !== "55432" ||
      db.pathname !== "/wellbeing_phase2_rehearsal" || db.username !== "postgres" ||
      db.search !== "?connection_limit=8" ||
      env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:55431" ||
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== "" || env.SUPABASE_SERVICE_ROLE_KEY !== "") throw 0;
  } catch { throw new Error("Rehearsal refused: approved isolated configuration required."); }
}
