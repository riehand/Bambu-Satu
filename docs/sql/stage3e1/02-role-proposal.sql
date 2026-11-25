-- PROPOSAL. HOSTED: NOT EXECUTED. Bukan migrasi otomatis atau persetujuan cutover.
-- Nama harus direkonsiliasi dengan pemilik DB dan Flutter; role existing menyebabkan gagal.
-- Persetujuan institusi/pemilik/Flutter dan review katalog wajib sebelum marker sesi:
-- SET wellbeing.stage3e_roles = 'reviewed-new-dedicated-roles';
-- Tidak memuat password/key/URL. NOLOGIN sampai custody/provisioning disetujui.
BEGIN;
DO $$ BEGIN
  IF current_setting('wellbeing.stage3e_roles',true) IS DISTINCT FROM 'reviewed-new-dedicated-roles' THEN
    RAISE EXCEPTION 'Stage3E role approval required';
  END IF;
END $$;
CREATE ROLE website_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE website_deployer NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE flutter_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
-- Tidak ada membership, pemindahan ownership Auth, atau ALTER managed role/default ACL.
GRANT USAGE ON SCHEMA public TO website_runtime,website_deployer;
GRANT CREATE ON SCHEMA public TO website_deployer;
GRANT SELECT,INSERT,UPDATE,DELETE ON public._prisma_migrations TO website_deployer;
GRANT REFERENCES(id) ON public.users TO website_deployer;
-- Enam pending migration membuat objek baru sebagai deployer; C4 mengubah objek miliknya.
-- Dua migrasi Auth sudah applied oleh platform owner. Deployer tidak mengulangnya.
-- public.users/Role/UserType/Auth functions tetap owner awal; tidak REASSIGN OWNED.
-- Tidak perlu sequence: UUID dibuat Prisma; jangan menambahkan ON ALL SEQUENCES.
COMMIT;
