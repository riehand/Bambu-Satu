-- PREPARED, NOT EXECUTED. Explicit approval for metadata queries is required.
-- Target connection must first be verified as bofoowyzlnfhwcstlmgp over TLS.
-- Use a fresh operator session, psql -X -v ON_ERROR_STOP=1, no application startup.
-- No application rows, auth.users records, object names, passwords, keys or logs.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SELECT current_database() AS database, session_user AS operator,
  current_setting('server_version_num') AS version,
  current_setting('transaction_read_only') AS read_only;

-- R2: expressions are returned as text, never evaluated against object rows.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='storage' AND tablename IN ('objects','buckets')
ORDER BY tablename,policyname;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets
WHERE id='assessment-reports';

-- R3: names, ownership, raw ACL and RLS; includes indexes for collision review.
SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
 c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','wb_guard','wb_crypto','wb_pdf')
 OR (n.nspname='storage' AND c.relname IN ('objects','buckets'))
ORDER BY n.nspname,c.relname;
SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl::text FROM pg_namespace
WHERE nspname IN ('public','extensions','storage','wb_guard','wb_crypto','wb_pdf');
SELECT n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner) AS owner,t.typacl::text
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
WHERE n.nspname IN ('public','wb_guard','wb_crypto','wb_pdf') ORDER BY n.nspname,t.typname;
-- No function bodies: catalog identity and ACL only.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proacl::text,
 ARRAY(SELECT setting FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%') AS search_path
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','wb_guard','wb_crypto','wb_pdf','storage','extensions')
ORDER BY n.nspname,p.proname,args;
SELECT n.nspname,c.relname,t.tgname,t.tgenabled,t.tgisinternal,p.proname AS function_name
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname IN ('public','wb_guard','wb_pdf') OR (n.nspname='auth' AND c.relname='users')
ORDER BY n.nspname,c.relname,t.tgname;
SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,
 k.confrelid::regclass::text AS referenced_table
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','wb_guard','wb_pdf') ORDER BY n.nspname,c.relname,k.conname;
SELECT schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check FROM pg_policies
WHERE schemaname IN ('public','wb_guard','wb_pdf') ORDER BY schemaname,tablename,policyname;
SELECT pg_get_userbyid(d.defaclrole) AS creator,coalesce(n.nspname,'*GLOBAL*') AS schema,
 d.defaclobjtype,d.defaclacl::text
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclnamespace=0 OR n.nspname IN ('public','storage','extensions','wb_guard','wb_crypto','wb_pdf');
SELECT rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls,rolcreaterole,rolcreatedb
FROM pg_roles ORDER BY rolname;
SELECT pg_get_userbyid(member) AS member,pg_get_userbyid(roleid) AS granted_role,
 admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY member,granted_role;
-- Effective membership includes indirect paths, unlike pg_auth_members alone.
SELECT a.rolname AS actor,b.rolname AS target,
 pg_has_role(a.oid,b.oid,'USAGE') AS inherits,pg_has_role(a.oid,b.oid,'SET') AS can_set
FROM pg_roles a CROSS JOIN pg_roles b
WHERE a.rolname IN ('anon','authenticated','service_role','authenticator','supabase_storage_admin',
 'website_runtime','wb_pdf_worker','wb_report_storage')
 AND (pg_has_role(a.oid,b.oid,'USAGE') OR pg_has_role(a.oid,b.oid,'SET'))
ORDER BY actor,target;
-- Raw ACL above retains PUBLIC entries; this matrix includes effective rights.
SELECT r.rolname,n.nspname,c.relname,v.privilege,
 has_table_privilege(r.oid,c.oid,v.privilege) AS allowed
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role','authenticator','supabase_storage_admin',
 'website_runtime','wb_pdf_worker','wb_report_storage')
AND c.relkind IN ('r','p') AND (n.nspname IN ('public','wb_guard','wb_pdf')
 OR (n.nspname='storage' AND c.relname IN ('objects','buckets')))
ORDER BY r.rolname,n.nspname,c.relname,v.privilege;
SELECT n.nspname,c.relname,a.attname,a.attacl::text
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
 AND n.nspname IN ('public','storage','wb_guard','wb_pdf');
SELECT n.nspname,r.rolname,has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,
 has_schema_privilege(r.oid,n.oid,'CREATE') AS create_allowed
FROM pg_namespace n CROSS JOIN pg_roles r
WHERE n.nspname IN ('public','storage','extensions','wb_guard','wb_crypto','wb_pdf')
 AND r.rolname IN ('anon','authenticated','service_role','authenticator','supabase_storage_admin',
 'website_runtime','wb_pdf_worker','wb_report_storage') ORDER BY n.nspname,r.rolname;
-- Ledger metadata only; do not select Prisma logs, which can include SQL errors.
SELECT migration_name,checksum,finished_at IS NOT NULL AS applied,
 rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name;
WITH expected(name,checksum,action) AS (VALUES
 ('20261021144827_init_users','1847814270d05a8411a3c63de8121639e8bc8b4ea4436635c451ee1cb6d15b59','preserve-applied'),
 ('20261023000000_supabase_auth','c5272ddb6fdd9624848d69bbeeb05fa5a4912d9a077264b21aaf20451b16622b','preserve-applied'),
 ('20261023010000_phase2_assessment','6befc228490a50bcc3fb411905fa7c5e0790066f2118a6de94a22bfdb77d3823','apply-pending-after-approval'),
 ('20261028000000_psychologist_profiles','4234dfcb585836426079f21e2b1bb9af180bb9c85d7f60ffcbcc7bd7adf69010','apply-pending-after-approval'),
 ('20261029000000_psychologist_availability','4f65c7aeb4ab586e5ff29f7905caadfaec10da1b285ef62d775c287604494ccb','apply-pending-after-approval'),
 ('20261029000001_appointments_report_consent','ad37a1fa0e8d6a97ef1c35d8a67f9067a0b6438f7ab5279d86473d4c984f93f3','apply-pending-after-approval'),
 ('20261120000000_psychologist_profiles_integrity','cf2bc074ba494e022bfc26e22ee3806d4022fe6549e518bf770c459033f45ea4','apply-pending-after-approval'),
 ('20261121000000_consultation_messages','7e3245ed4c0f17b1c3f5691ee2333727d0a1d7ca79278b3f37cb3f876f80d3ce','apply-pending-after-approval')
)
SELECT coalesce(e.name,m.migration_name) AS migration,e.action,
 e.checksum AS expected_checksum,m.checksum AS actual_checksum,
 m.finished_at IS NOT NULL AS applied,m.rolled_back_at IS NOT NULL AS rolled_back,
 CASE WHEN e.name IS NULL THEN 'UNEXPECTED_LEDGER_ENTRY'
 WHEN e.action='preserve-applied' AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
  AND e.checksum=m.checksum THEN 'PASS_BASELINE'
 WHEN e.action='apply-pending-after-approval' AND m.migration_name IS NULL THEN 'PASS_PENDING'
 ELSE 'BLOCKED_DRIFT_OR_FAILED_MIGRATION' END AS review
FROM expected e FULL JOIN public._prisma_migrations m ON m.migration_name=e.name
ORDER BY migration;
-- Hook activation is Auth service configuration, NOT established by SQL existence.
-- Owner must separately inspect Dashboard Authentication > Hooks (enabled + URI).
-- Hash only: no function source, user records or credentials returned.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proacl::text,
 md5(replace(p.prosrc,E'\r\n',E'\n')) AS body_fingerprint
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname='handle_auth_user_created')
 OR n.nspname='wb_machine'
ORDER BY n.nspname,p.proname,args;
-- Explicit column ACL and effective access through inherited/SET-able roles.
SELECT a.attname,a.attacl::text FROM pg_attribute a
WHERE a.attrelid='public._prisma_migrations'::regclass
 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT actor.rolname AS actor,target.rolname AS reachable_role,
 has_table_privilege(target.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_access,
 has_any_column_privilege(target.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') AS column_access
FROM pg_roles actor CROSS JOIN pg_roles target
WHERE actor.rolname IN ('anon','authenticated')
 AND (actor.oid=target.oid OR pg_has_role(actor.oid,target.oid,'USAGE') OR pg_has_role(actor.oid,target.oid,'SET'))
ORDER BY actor.rolname,target.rolname;
ROLLBACK;
