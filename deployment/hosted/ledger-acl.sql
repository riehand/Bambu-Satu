-- APPROVAL REQUIRED. Only ACL of public._prisma_migrations is changed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('wellbeing.approved_hosted_ref',true) IS DISTINCT FROM 'bofoowyzlnfhwcstlmgp'
 OR (SELECT relowner FROM pg_class WHERE oid='public._prisma_migrations'::regclass)
    IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname='postgres')
 THEN RAISE EXCEPTION 'Verified project and existing Prisma operator required'; END IF;
END $$;
REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; actor record; target record; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute
 WHERE attrelid='public._prisma_migrations'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public._prisma_migrations FROM PUBLIC,anon,authenticated',cols);
 -- Never revoke role membership/global ACL to make this check pass. Roll back instead.
 FOR actor IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
  FOR target IN SELECT oid,rolname FROM pg_roles
   WHERE oid=actor.oid OR pg_has_role(actor.oid,oid,'USAGE') OR pg_has_role(actor.oid,oid,'SET') LOOP
   IF has_table_privilege(target.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_any_column_privilege(target.oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES')
   THEN RAISE EXCEPTION 'Remaining inherited/effective ledger privilege; no changes committed'; END IF;
  END LOOP;
 END LOOP;
 IF NOT has_table_privilege('postgres','public._prisma_migrations','SELECT')
 OR NOT has_table_privilege('postgres','public._prisma_migrations','INSERT')
 OR NOT has_table_privilege('postgres','public._prisma_migrations','UPDATE')
 OR NOT has_table_privilege('postgres','public._prisma_migrations','DELETE')
 THEN RAISE EXCEPTION 'Prisma operator privileges must remain'; END IF;
END $$;
COMMIT;
