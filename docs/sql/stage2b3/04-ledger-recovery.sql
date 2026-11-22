-- SEPARATE APPROVAL REQUIRED. HOSTED: NOT EXECUTED.
-- Before remediation COMMIT: use ROLLBACK instead; that restores exact prior ACLs.
-- After COMMIT: do NOT restore browser/PUBLIC grants. If deployment is blocked,
-- review the saved ACL and grant only these necessary privileges to the verified
-- deployer. Ownership/DDL/role-membership failures need a separate reviewed plan.
-- SET wellbeing.ledger_recovery_approval = 'reviewed-deployer-only-recovery';
-- SET wellbeing.ledger_owner = '<verified owner>';
-- SET wellbeing.ledger_deployer = '<approved deployer>';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE deployer text := current_setting('wellbeing.ledger_deployer',true); owner_name text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public._prisma_migrations'::regclass;
  IF current_setting('wellbeing.ledger_recovery_approval',true) IS DISTINCT FROM 'reviewed-deployer-only-recovery'
    OR owner_name IS DISTINCT FROM current_setting('wellbeing.ledger_owner',true) OR current_user<>owner_name
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=deployer)
    OR deployer IN ('anon','authenticated','service_role')
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND pg_has_role(oid,deployer,'MEMBER')) THEN
    RAISE EXCEPTION 'Recovery requires approved owner and a deployer unreachable by browser roles';
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public._prisma_migrations TO %I',deployer);
END $$;
COMMIT;
-- Re-run 03-ledger-postcheck.sql and approved Prisma status/deploy checks.
