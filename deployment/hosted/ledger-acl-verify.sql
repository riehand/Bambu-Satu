-- Post-change verification: metadata only, separately authorized with the patch.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
SELECT current_setting('transaction_read_only') AS read_only,
 pg_get_userbyid(relowner) AS owner,relacl::text,relrowsecurity
FROM pg_class WHERE oid='public._prisma_migrations'::regclass;
-- Expected zero rows: PUBLIC table/column grants.
SELECT 'table' AS scope,p.privilege_type FROM pg_class c,
 LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) p
WHERE c.oid='public._prisma_migrations'::regclass AND p.grantee=0
UNION ALL
SELECT a.attname,p.privilege_type FROM pg_attribute a,LATERAL aclexplode(a.attacl) p
WHERE a.attrelid='public._prisma_migrations'::regclass AND p.grantee=0;
-- All booleans must be false, including inherited and SET ROLE paths.
SELECT a.rolname AS actor,t.rolname AS reachable_role,
 has_table_privilege(t.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS table_access,
 has_any_column_privilege(t.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') AS column_access
FROM pg_roles a CROSS JOIN pg_roles t
WHERE a.rolname IN ('anon','authenticated') AND
 (a.oid=t.oid OR pg_has_role(a.oid,t.oid,'USAGE') OR pg_has_role(a.oid,t.oid,'SET'));
-- Four true values required. No actual ledger row mutations are tested.
SELECT has_table_privilege('postgres','public._prisma_migrations','SELECT') AS operator_select,
 has_table_privilege('postgres','public._prisma_migrations','INSERT') AS operator_insert,
 has_table_privilege('postgres','public._prisma_migrations','UPDATE') AS operator_update,
 has_table_privilege('postgres','public._prisma_migrations','DELETE') AS operator_delete;
SELECT attname,attacl::text FROM pg_attribute
WHERE attrelid='public._prisma_migrations'::regclass AND attnum>0 AND NOT attisdropped AND attacl IS NOT NULL;
-- Compare with the pre-change evidence; no logs or application rows.
SELECT migration_name,checksum,finished_at IS NOT NULL AS applied,rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations ORDER BY migration_name;
ROLLBACK;
