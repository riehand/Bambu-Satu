// Offline artifact preparation only. Never connects to a database or executes SQL.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const ref = process.argv[2];
const shared = process.argv[3] === "--shared";
if (process.argv[3] && !shared) throw new Error("Unknown target mode");
const mode = shared ? "hosted" : "staging";
if (!/^[a-z0-9]{20}$/.test(ref ?? "")) throw new Error("Supply the approved staging project ref (not credentials)");
const sources = [
  "stage3e1b/01-identity", "stage3e1b/02-runtime-policies", "stage3e1b/03-mutation-guards", "stage3e1b/04-monitor",
  "stage3e1c/01-scoring", "stage3e1c/02-projections", "stage3e1c/03-report-boundary",
  "phase4-sprint3/00-booking-consent-base",
  "phase4-sprint2/00-close-interactive-finalizer", "phase4-sprint2/01-authorities", "phase4-sprint2/02-gateways",
  "phase4-sprint3/01-read-projections", "phase4-sprint3/02-booking-artifact", "phase4-sprint3/03-report-scope",
];
const manifest = [];
const authorityRoles = new Set();
const sql = sources.map(name => {
  const path = `docs/sql/${name}.sql`;
  const original = readFileSync(path, "utf8");
  manifest.push({ path, sha256: createHash("sha256").update(original).digest("hex") });
  let value = original.replace(/DO \$\$\s*BEGIN\s+IF current_database\(\)[\s\S]*?END \$\$;/g, "");
  value = value.replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
  value = value.replaceAll("current_database()<>'wellbeing_phase3_rehearsal'", "current_database()<>'postgres'");
  value = value.replaceAll("wellbeing-local-runtime-v1", `wellbeing-${mode}-${ref}-v1`)
    .replaceAll("wellbeing-local-pdf-worker", `wellbeing-${mode}-${ref}-pdf-worker`).replaceAll("'local-v1'", `'${mode}-v1'`);
  // Supabase owns pgcrypto in extensions: do not move/drop the platform extension.
  value = value.replace("CREATE EXTENSION pgcrypto WITH SCHEMA wb_crypto;", `
CREATE FUNCTION wb_crypto.hmac(bytea,bytea,text) RETURNS bytea LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog AS 'SELECT extensions.hmac($1,$2,$3)';
CREATE FUNCTION wb_crypto.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql VOLATILE STRICT
SET search_path=pg_catalog AS 'SELECT extensions.gen_random_bytes($1)';
GRANT USAGE ON SCHEMA extensions TO wb_identity_guard;
`);
  // PostgreSQL managed operators are not superusers. Use temporary setup
  // memberships and schema CREATE only while assigning definer ownership.
  value = value.replace(/CREATE ROLE (wb_\w+)([^;]+);/g, (statement, role) => {
    if (role === "wb_pdf_worker") return statement;
    authorityRoles.add(role);
    return `${statement}\nGRANT ${role} TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;`;
  });
  value = value.replace(/ALTER FUNCTION (wb_guard|wb_pdf)\.([^;]+) OWNER TO (wb_\w+);/g,
    (statement, schema, _signature, role) => `GRANT CREATE ON SCHEMA ${schema} TO ${role};\n${statement}\nREVOKE CREATE ON SCHEMA ${schema} FROM ${role};`);
  if (value.includes("rehearsal.identity") || value.includes("wellbeing-local-") || value.includes("current_setting('wellbeing.stage")) throw new Error(`Unadapted local guard: ${path}`);
  return `\n-- Adapted from ${path}; source checksum is in manifest.json.\n${value}`;
});
const privilegePath = "docs/sql/stage3e1/03-object-privileges.sql";
const privilegeSource = readFileSync(privilegePath, "utf8");
manifest.push({ path: privilegePath, sha256: createHash("sha256").update(privilegeSource).digest("hex") });
const grants = privilegeSource.split("GRANT SELECT(id,full_name")[1];
if (!grants) throw new Error("Privilege source changed; review required");
const envelope = `GRANT SELECT(id,full_name${grants}`.replace(/^COMMIT;\s*$/gm, "");
const prelude = `-- ${shared ? "SHARED HOSTED: preserve existing users/Auth/Flutter ACL and data" : "STAGING ONLY"}. Review exact target before operator execution.
-- psql -X -v ON_ERROR_STOP=1; no application/build invokes this artifact.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<170000 OR current_database()<>'postgres' OR current_setting('wellbeing.approved_${mode}_ref',true) IS DISTINCT FROM '${ref}'
 OR to_regclass('auth.users') IS NULL ${shared ? "OR to_regnamespace('chatbot') IS NULL" : "OR to_regnamespace('chatbot') IS NOT NULL"}
 OR to_regnamespace('wb_guard') IS NOT NULL OR to_regnamespace('wb_pdf') IS NOT NULL
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>8
 THEN RAISE EXCEPTION 'Approved target and eight applied migrations required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname='extensions')
 THEN RAISE EXCEPTION 'pgcrypto in extensions required; do not relocate platform extensions'; END IF;
END $$;
CREATE ROLE website_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO website_runtime;
DO $$ DECLARE t text; cols text; BEGIN
 FOREACH t IN ARRAY ARRAY[${shared ? "" : "'_prisma_migrations',"}'users','academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports','psychologist_profiles','psychologist_availability','appointments','consultation_sessions','consents','consent_audit_events','consultation_messages'] LOOP
  IF t<>'users' OR NOT ${shared} THEN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END IF;
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
  IF t='users' THEN
   EXECUTE format('REVOKE ALL ON public.%I FROM ${shared ? 'website_runtime' : 'service_role,website_runtime'}',t);
   EXECUTE format('REVOKE ALL (%s) ON public.%I FROM ${shared ? 'website_runtime' : 'service_role,website_runtime'}',cols,t);
  ELSE
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,website_runtime',t);
   EXECUTE format('REVOKE ALL (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role,website_runtime',cols,t);
  END IF;
 END LOOP;
END $$;
${envelope}
`;
const ending = `
-- Neither test identity nor local signer is usable. Random independent secrets
-- must be transferred privately to signer and PDF worker by the approved operator.
GRANT USAGE ON SCHEMA extensions TO wb_pdf_finalizer;
REVOKE ALL ON public.consultation_messages FROM website_runtime;
-- No lifecycle/chat gateways are installed in this bundle.
${[...authorityRoles].map(role => `REVOKE ${role} FROM CURRENT_USER;`).join("\n")}
COMMIT;
`;
const output = shared ? "deployment/hosted" : ".tmp/staging-package";
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/gateways.sql`, prelude + sql.join("\n") + ending);
writeFileSync(`${output}/manifest.json`, JSON.stringify({ ref, mode, sources: manifest, executed: false }, null, 2));
console.log(`Prepared ${output}/gateways.sql and manifest.json; no SQL executed.`);
