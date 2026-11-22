-- APPROVAL-GATED PROPOSAL. HOSTED: NOT EXECUTED. Never part of migrate deploy.
-- PostgreSQL 17. Review precheck output, ACL snapshot, ownership and deployer first.
-- In the approved session only, explicitly SET these non-secret review markers:
-- SET wellbeing.ledger_approval = 'reviewed-exact-ledger-only';
-- SET wellbeing.ledger_owner = '<verified owner>'; -- must equal current_user
-- SET wellbeing.ledger_deployer = '<approved deployer>';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public._prisma_migrations IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE owner_name text; deployer text := current_setting('wellbeing.ledger_deployer',true);
        columns_sql text; browser record; target record;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class WHERE oid='public._prisma_migrations'::regclass;
  IF current_setting('wellbeing.ledger_approval',true) IS DISTINCT FROM 'reviewed-exact-ledger-only'
    OR owner_name IS DISTINCT FROM current_setting('wellbeing.ledger_owner',true)
    OR current_user <> owner_name OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=deployer)
    OR deployer IN ('anon','authenticated','service_role') THEN
    RAISE EXCEPTION 'Ledger hardening requires reviewed owner/session/deployer and explicit approval';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')) <> 2 THEN
    RAISE EXCEPTION 'Expected browser roles missing';
  END IF;
  -- Avoid ambiguous grantor semantics or CASCADE into unreviewed dependencies.
  IF EXISTS (
    SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x
    WHERE c.oid='public._prisma_migrations'::regclass AND x.grantor<>c.relowner
  ) OR EXISTS (
    SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
    JOIN pg_class c ON c.oid=a.attrelid
    WHERE a.attrelid='public._prisma_migrations'::regclass AND x.grantor<>c.relowner
  ) THEN RAISE EXCEPTION 'Unexpected ledger grantor; review exact grant chain before remediation'; END IF;

  REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM PUBLIC, anon, authenticated RESTRICT;
  SELECT string_agg(quote_ident(attname),', ' ORDER BY attnum) INTO columns_sql
    FROM pg_attribute WHERE attrelid='public._prisma_migrations'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE 'REVOKE ALL PRIVILEGES (' || columns_sql || ') ON TABLE public._prisma_migrations FROM PUBLIC, anon, authenticated RESTRICT';

  FOR browser IN SELECT oid,rolname,rolsuper FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    IF browser.rolsuper OR has_table_privilege(browser.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_any_column_privilege(browser.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'Browser effective ledger access remains; transaction must roll back';
    END IF;
    FOR target IN SELECT oid,rolsuper FROM pg_roles WHERE oid<>browser.oid AND pg_has_role(browser.oid,oid,'SET') LOOP
      IF target.rolsuper OR has_table_privilege(target.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(target.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Browser SET ROLE path retains ledger access; review memberships separately';
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
    WHERE NOT has_table_privilege(deployer,'public._prisma_migrations',p.privilege)) THEN
    RAISE EXCEPTION 'Approved deployer lacks required ledger privileges; transaction must roll back';
  END IF;
END $$;
-- Any error aborts this transaction. Do not force COMMIT after a failed guard.
COMMIT;
