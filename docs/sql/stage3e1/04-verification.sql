-- READ ONLY. HOSTED: NOT EXECUTED. Run 01 juga untuk matriks lengkap before/after.
BEGIN READ ONLY;
SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,
       has_schema_privilege(oid,'public','CREATE') AS public_create,
       has_schema_privilege(oid,'chatbot','USAGE') AS chatbot_usage
FROM pg_roles WHERE rolname IN ('website_runtime','website_deployer','flutter_runtime');
-- Hasil berikut harus kosong. Jangan menganggap NOINHERIT menutup SET ROLE.
SELECT b.rolname,t.rolname AS reachable FROM pg_roles b CROSS JOIN pg_roles t
WHERE b.rolname IN ('anon','authenticated','website_runtime','flutter_runtime') AND b.oid<>t.oid
  AND (pg_has_role(b.oid,t.oid,'USAGE') OR pg_has_role(b.oid,t.oid,'SET'));
SELECT r.rolname,c.relname,
  has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_access,
  has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS column_access
FROM pg_roles r CROSS JOIN pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
 AND r.rolname IN ('anon','authenticated','service_role','flutter_runtime') ORDER BY 1,2;
SELECT r.rolname,p.privilege,has_table_privilege(r.oid,'public._prisma_migrations',p.privilege) AS allowed
FROM pg_roles r CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
WHERE r.rolname IN ('website_deployer','website_runtime','flutter_runtime');
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner,
  (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) AS policies
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r';
-- Tidak ada policy runtime = blocker, BUKAN bukti workflow berhasil.
COMMIT;
