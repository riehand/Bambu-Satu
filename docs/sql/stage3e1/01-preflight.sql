-- READ ONLY. HOSTED: NOT EXECUTED. Metadata saja; tidak membaca baris klinis/secret.
-- PostgreSQL 17. Jalankan hanya sesudah izin preflight terpisah.
BEGIN READ ONLY;
SELECT current_database(), current_user, current_setting('server_version_num');
SELECT r.rolname,d.datname,d.datacl,p.privilege,has_database_privilege(r.oid,d.oid,p.privilege) AS allowed
FROM pg_roles r CROSS JOIN pg_database d CROSS JOIN (VALUES('CONNECT'),('CREATE'),('TEMPORARY')) p(privilege)
WHERE d.datname=current_database() AND r.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role',current_user);
SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolcanlogin,rolinherit
FROM pg_roles ORDER BY rolname;
SELECT pg_get_userbyid(member) AS member,pg_get_userbyid(roleid) AS target,
       admin_option,inherit_option,set_option FROM pg_auth_members;
SELECT b.rolname AS source,t.rolname AS target,
       pg_has_role(b.oid,t.oid,'USAGE') AS inherited,pg_has_role(b.oid,t.oid,'SET') AS can_set
FROM pg_roles b CROSS JOIN pg_roles t
WHERE b.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role')
  AND b.oid<>t.oid AND pg_has_role(b.oid,t.oid,'MEMBER');
SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,n.nspacl,r.rolname,
       has_schema_privilege(r.oid,n.oid,'USAGE') AS usage,has_schema_privilege(r.oid,n.oid,'CREATE') AS create_allowed
FROM pg_namespace n CROSS JOIN pg_roles r
WHERE n.nspname IN ('public','auth','chatbot','storage')
  AND r.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role',current_user);
SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','chatbot','storage') AND c.relkind IN ('r','p','v','m','S') ORDER BY 1,2;
SELECT r.rolname,n.nspname,c.relname,p.privilege,has_table_privilege(r.oid,c.oid,p.privilege) AS allowed
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
WHERE n.nspname IN ('public','chatbot') AND c.relkind IN ('r','p','v','m')
  AND r.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role',current_user) ORDER BY 1,2,3,4;
SELECT r.rolname,n.nspname,c.relname,a.attname,a.attacl,p.privilege,
       has_column_privilege(r.oid,c.oid,a.attnum,p.privilege) AS allowed
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
CROSS JOIN pg_roles r CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE n.nspname IN ('public','chatbot') AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
  AND r.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role',current_user) ORDER BY 1,2,3,a.attnum,6;
SELECT r.rolname,n.nspname,c.relname,p.privilege,has_sequence_privilege(r.oid,c.oid,p.privilege) AS allowed
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
CROSS JOIN (VALUES ('USAGE'),('SELECT'),('UPDATE')) p(privilege)
WHERE n.nspname IN ('public','chatbot') AND c.relkind='S'
  AND r.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role',current_user);
SELECT p.oid::regprocedure AS function,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl,
       r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute_allowed
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
WHERE n.nspname IN ('public','auth','chatbot','storage')
  AND r.rolname IN ('anon','authenticated','website_runtime','website_deployer','flutter_runtime','service_role',current_user);
SELECT tgrelid::regclass,tgname,tgfoid::regprocedure,tgdeferrable,tginitdeferred,pg_get_triggerdef(oid)
FROM pg_trigger WHERE NOT tgisinternal;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname IN ('public','auth','chatbot','storage');
SELECT pg_get_userbyid(d.defaclrole) AS creator,n.nspname,d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace;
SELECT conrelid::regclass,confrelid::regclass,conname,convalidated,pg_get_constraintdef(oid)
FROM pg_constraint WHERE contype='f' AND connamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN ('public','chatbot'));
SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations ORDER BY migration_name;
COMMIT;
