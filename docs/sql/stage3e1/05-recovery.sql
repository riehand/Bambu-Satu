-- PROPOSAL. HOSTED: NOT EXECUTED. Approval recovery terpisah, bukan auto rollback.
-- Sebelum COMMIT gagal: ROLLBACK mengembalikan ACL. Sesudah COMMIT: hentikan cutover,
-- isolasi traffic/mutation; diagnosis SQLSTATE tanpa row/parameter/secret logging.
-- Jangan pulihkan blanket browser/service_role grants atau runtime postgres.
-- Deployer ledger saja dapat dipulihkan setelah ownership/membership diverifikasi.
-- SET wellbeing.stage3e_recovery = 'reviewed-deployer-ledger-only';
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF current_setting('wellbeing.stage3e_recovery',true) IS DISTINCT FROM 'reviewed-deployer-ledger-only'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='website_deployer' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb)
    OR (SELECT relowner<>current_user::regrole FROM pg_class WHERE oid='public._prisma_migrations'::regclass)
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','website_runtime','flutter_runtime')
      AND pg_has_role(oid,'website_deployer','MEMBER')) THEN
    RAISE EXCEPTION 'Stage3E recovery approval or safe deployer missing';
  END IF;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public._prisma_migrations TO website_deployer;
COMMIT;
-- Ulangi inventory/verifikasi dan Prisma status memakai deployer. Untuk DDL gagal:
-- review transaction/ledger/constraint; jangan edit checksum, migrate reset, db push,
-- CASCADE, atau migrate resolve tanpa diagnosis/approval. Gunakan forward migration.
-- Restore backup diuji terpisah ke target baru; tidak overwrite shared database.
