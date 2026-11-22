-- READ ONLY. HOSTED: NOT EXECUTED. Run also 01-ledger-precheck.sql for ACL comparison.
BEGIN READ ONLY;
SELECT r.rolname,
  has_table_privilege(r.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS any_table_privilege,
  has_any_column_privilege(r.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') AS any_column_privilege
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated');
-- Both flags must be false. No rows may remain below (including SET-only paths).
SELECT b.rolname AS browser_role,r.rolname AS reachable_role
FROM pg_roles b CROSS JOIN pg_roles r
WHERE b.rolname IN ('anon','authenticated') AND b.oid<>r.oid
  AND pg_has_role(b.oid,r.oid,'SET')
  AND (r.rolsuper OR has_table_privilege(r.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_any_column_privilege(r.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES'));
SELECT current_setting('wellbeing.ledger_deployer',true) AS approved_deployer,p.privilege,
  has_table_privilege(current_setting('wellbeing.ledger_deployer',true),'public._prisma_migrations',p.privilege) AS allowed
FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege);
-- All deployer flags must be true; additionally run Prisma status with its approved credential.
SELECT count(*) AS migration_count,count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unresolved
FROM public._prisma_migrations;
COMMIT;
