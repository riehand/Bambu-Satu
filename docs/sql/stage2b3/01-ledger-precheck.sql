-- READ ONLY. HOSTED: NOT EXECUTED. Capture metadata securely; no user/ledger logs.
BEGIN READ ONLY;
SELECT current_database(), current_user, current_setting('server_version_num') AS server_version;
SELECT c.oid::regclass AS object, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_class c WHERE c.oid = 'public._prisma_migrations'::regclass;
SELECT a.attname, a.atttypid::regtype AS type, a.attnotnull, a.attacl
FROM pg_attribute a WHERE a.attrelid = 'public._prisma_migrations'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT 'table' AS scope, NULL::text AS column_name,
       pg_get_userbyid(x.grantor) AS grantor,
       CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS grantee,
       x.privilege_type, x.is_grantable
FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) x
WHERE c.oid='public._prisma_migrations'::regclass
UNION ALL
SELECT 'column', a.attname, pg_get_userbyid(x.grantor),
       CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
       x.privilege_type, x.is_grantable
FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
WHERE a.attrelid='public._prisma_migrations'::regclass AND a.attnum>0 AND NOT a.attisdropped;

-- Individual privilege predicates: comma-separated lists mean ANY, not ALL.
SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolinherit, p.privilege,
       has_table_privilege(r.oid,'public._prisma_migrations',p.privilege) AS table_allowed
FROM pg_roles r CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role',current_user)
ORDER BY r.rolname,p.privilege;
SELECT r.rolname, a.attname, p.privilege,
       has_column_privilege(r.oid,a.attrelid,a.attnum,p.privilege) AS column_allowed
FROM pg_roles r CROSS JOIN pg_attribute a CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
WHERE r.rolname IN ('anon','authenticated','service_role',current_user)
  AND a.attrelid='public._prisma_migrations'::regclass AND a.attnum>0 AND NOT a.attisdropped;

-- PostgreSQL 17: inspect both automatic inheritance and SET ROLE paths.
SELECT b.rolname AS browser_role, r.rolname AS reachable_role,
       pg_has_role(b.oid,r.oid,'USAGE') AS automatically_inherited,
       pg_has_role(b.oid,r.oid,'SET') AS can_set_role,
       r.rolsuper,r.rolbypassrls
FROM pg_roles b CROSS JOIN pg_roles r
WHERE b.rolname IN ('anon','authenticated') AND b.oid<>r.oid AND pg_has_role(b.oid,r.oid,'MEMBER');
SELECT pg_get_userbyid(m.member) AS member, pg_get_userbyid(m.roleid) AS granted_role,
       m.admin_option,m.inherit_option,m.set_option
FROM pg_auth_members m;
SELECT pg_get_userbyid(d.defaclrole) AS creator, n.nspname AS schema,
       d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE n.nspname='public' OR d.defaclnamespace=0;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE (schemaname='public' AND tablename IN ('users','_prisma_migrations'));
SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations ORDER BY migration_name;
COMMIT;
