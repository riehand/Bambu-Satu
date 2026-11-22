# Stage 2B.3 — Shared Database Security & Migration Readiness

Tanggal laporan: **20 November 2026, Asia/Jakarta**. Branch: `riehand_branch`.

**Hanya persiapan dan rehearsal lokal. Semua SQL hosted dalam dokumen ini dan `docs/sql/stage2b3/` berstatus NOT EXECUTED.** Tidak ada koneksi ke hosted Supabase, pembacaan secret, perubahan Dashboard, bucket, Auth produksi, privilege hosted, commit, push, atau deployment.

## A. Database baseline dan sumber bukti

| Hal | Temuan hosted yang diberikan pemilik, bukan pemeriksaan baru | Bukti lokal tahap ini |
| --- | --- | --- |
| Ledger website | Hanya init_users dan supabase_auth tercatat applied; empat migrasi berikutnya belum applied | Keenam migrasi historis diterapkan ke database kosong, kemudian C4; tujuh checksum cocok |
| Schema public | Hanya users dan _prisma_migrations | Semua objek website dibuat dari SQL repository |
| Chatbot | Schema chatbot sudah berisi _backend_migrations, chat_sessions, checkins, messages, safety_events, user_memories | Enam tabel padanan sintetis; OID, owner, ACL, RLS, data sentinel, dan ledger terpisah tetap utuh |
| RLS/grants ledger | RLS disabled; anon/authenticated memiliki SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER; grantor postgres | Grant tabel, PUBLIC, grant kolom tersendiri, inheritance, dan SET-only path direproduksi lalu diuji |
| Data API | Enabled; public dan graphql_public exposed; chatbot tidak exposed; automatic exposure aktif saat inspeksi | Tidak ada REST/GraphQL/Supabase API server pada rehearsal |
| Storage | Bucket assessment-reports belum ada | Implementasi dan tes mock ditinjau; bucket hosted tidak dibuat |

Hak database yang berlebihan adalah temuan terkonfirmasi dari inspeksi pemilik. Reachability REST/GraphQL tabel ledger dan eksploitasi eksternal **belum terbukti**. Jangan menyamakan schema exposure dengan kepastian endpoint bisa dieksploitasi. Mematikan automatic exposure bukan pencabutan ACL objek yang sudah ada.

Dokumen Phase 2/PROGRESS-FASE3 mencatat hasil pada tanggal sebelumnya. Dokumen tersebut tidak menjadi bukti status hosted baru. Kontrak Chatbot lama masih menyebut schema sebagai proposal; informasi terbaru dari pemilik menyatakan schema tersebut sudah ada.

## B. Inventaris migrasi, urutan dan checksum

| Urutan | Migrasi | Dependensi dan tujuan | Hosted menurut pemilik |
| --- | --- | --- | --- |
| 1 | 20261021144827_init_users | Role/UserType, users, PK dan unique index | Applied |
| 2 | 20261023000000_supabase_auth | Memerlukan auth.users dan identitas yang cocok; FK, signup/email triggers, own-profile RLS | Applied |
| 3 | 20261023010000_phase2_assessment | users/roles Auth; tujuh tabel assessment, enums, constraints, partial indexes, lima trigger | Pending |
| 4 | 20261028000000_psychologist_profiles | users; satu profil per user, RLS/backend-only grants; memuat C4 | Pending |
| 5 | 20261029000000_psychologist_availability | users; fixed sessions, unique psikolog/tanggal/sesi, RLS | Pending |
| 6 | 20261029000001_appointments_report_consent | Assessment, reports, availability, users; composite FKs, booking uniqueness, consent dan audit immutable | Pending |
| 7 | 20261120000000_psychologist_profiles_integrity | Tabel profil dari urutan 4; koreksi PK dan nullability array | Baru, pending |

SHA-256 byte file yang dipertahankan dan dibandingkan dengan ledger PostgreSQL lokal:

```text
20261021144827_init_users                          1847814270d05a8411a3c63de8121639e8bc8b4ea4436635c451ee1cb6d15b59
20261023000000_supabase_auth                       c5272ddb6fdd9624848d69bbeeb05fa5a4912d9a077264b21aaf20451b16622b
20261023010000_phase2_assessment                   6befc228490a50bcc3fb411905fa7c5e0790066f2118a6de94a22bfdb77d3823
20261028000000_psychologist_profiles               4234dfcb585836426079f21e2b1bb9af180bb9c85d7f60ffcbcc7bd7adf69010
20261029000000_psychologist_availability           4f65c7aeb4ab586e5ff29f7905caadfaec10da1b285ef62d775c287604494ccb
20261029000001_appointments_report_consent         ad37a1fa0e8d6a97ef1c35d8a67f9067a0b6438f7ab5279d86473d4c984f93f3
20261120000000_psychologist_profiles_integrity     cf2bc074ba494e022bfc26e22ee3806d4022fe6549e518bf770c459033f45ea4
```

Keenam file historis tidak diubah, termasuk file pending. `.gitattributes` sudah mempertahankan LF pada migration.sql. Tes regresi mengunci keenam checksum. Jangan mengedit ledger/checksum untuk menyembunyikan drift.

**Konsistensi schema:** Prisma 5.22 validate lulus; C4 sesuai `id @id` dan array non-null. `@default(uuid())` dikerjakan Prisma, sehingga tidak adanya default UUID SQL bukan otomatis drift. SQL juga memiliki perlindungan yang tidak seluruhnya direpresentasikan PSL: Auth FK lintas-schema, RLS, triggers, checks, expression/partial indexes.

Temuan tambahan yang tidak diubah dalam koreksi C4: `consents.policy_version` adalah VARCHAR(80) dalam SQL, sedangkan `Consent.policyVersion` belum memiliki `@db.VarChar(80)` pada schema. Runtime policy saat ini pendek, tetapi keselarasan deklaratif penuh perlu review terpisah. `prisma migrate diff` database→datamodel gagal P4002 karena datasource single-schema tidak mencantumkan auth untuk FK public.users→auth.users. Jangan menghapus FK, mengadopsi model Auth, atau menerapkan hasil diff/drop otomatis untuk melewatinya. Katalog terisolasi disimpan sebagai bukti; tidak ada klaim schema tanpa drift secara menyeluruh.

## C. Koreksi C4

File: `prisma/migrations/20261120000000_psychologist_profiles_integrity/migration.sql`.

- Transaksi dengan lock eksklusif pada tabel profil, lock timeout 5 detik dan statement timeout 60 detik. Timeout berarti hentikan/review window, bukan paksa lock.
- Preflight menolak NULL/duplikat ID, elemen array NULL, array multidimensi atau lower bound nonstandar. Tidak memilih/menghapus profil duplikat secara otomatis.
- Whole-column NULL pada areas_of_focus/languages diisi `ARRAY[]::TEXT[]`; nilai lain, UUID, timestamps, relasi, dan profil dipertahankan.
- Menambah `psychologist_profiles_pkey PRIMARY KEY(id)`, mempertahankan default array kosong, dan menetapkan NOT NULL pada dua array.
- FK user, unique user_id, RLS dan ACL tidak diubah. Tidak ada DROP, reset, perubahan role atau broad grants.

PostgreSQL nyata dan PGlite membuktikan backfill, preservation, default, PK/index, rejection duplicate/null/FK, dan rollback sebelum backfill pada data invalid. Pemeriksaan bentuk array adalah preflight data lama; migration ini tidak menambahkan check constraint array baru untuk semua penulisan berikutnya.

## D. Temuan keamanan dan privilege yang dibutuhkan

1. **Verified misconfiguration (bukti pemilik):** browser-role ledger privileges terlalu luas. RLS disabled memperbesar konsekuensinya jika jalur API tersedia. Status hosted belum diperbaiki.
2. **Potential exposure:** public dan graphql_public exposed, automatic exposure aktif. Per-table reachability, schema cache, endpoint filtering, JWT/role mapping, dan column ACL hosted belum diperiksa langsung. Pengujian HTTP hosted memerlukan izin terpisah; jangan melakukan mutation probe pada ledger.
3. **Runtime risk:** audit repository terdahulu mencatat postgres BYPASSRLS dan keanggotaan berprivilege. Tidak diverifikasi ulang hosted. Rehearsal aplikasi memakai postgres superuser lokal; keberhasilan object-level authorization aplikasi bukan bukti least-privilege database isolation.
4. **service_role risk:** default ACL sintetis yang meniru temuan audit memberi service_role akses ke tabel/function website baru. RLS tidak menahan BYPASSRLS. Enam migrasi historis mencabut PUBLIC/anon/authenticated pada tabel privat, tetapi tidak service_role. Rehearsal membuktikan SELECT reports oleh service_role masih berhasil. Hardening ledger ini sengaja tidak mengubah platform role atau service-role grants.
5. **Unresolved:** custody credential Flutter/website, role inheritance aktual, deployer final, ACL kolom aktual, recovery backup, dan Data API reachability. Tidak ada sertifikasi bahwa backend Flutter berprivilege tidak bisa membaca assessment.

Kebutuhan akses berdasarkan source saat ini (matriks persiapan, **bukan GRANT yang diimplementasikan**):

| Identitas | Kebutuhan | Yang tidak diperlukan / batas |
| --- | --- | --- |
| Website runtime | CONNECT/USAGE; baca users/profil/content/period/session/score/report/consent; create/update profile dan availability; create/update session/answers; insert score; insert/update report; create booking/session/consent dan update lifecycle consent; insert audit | Tidak perlu mutasi ledger, DDL, role administration, schema chatbot, truncate atau update/delete skor/audit |
| Row-lock runtime | SELECT serta privilege UPDATE pada setidaknya satu kolom tabel untuk FOR UPDATE/FOR SHARE; users, periods, question sets, availability, appointments, consents dipakai dalam locking/trigger | Jangan memberi UPDATE luas pada role/is_active/identity untuk menyelesaikan masalah lock; desain grant kolom dan RLS/security-definer helper harus direhearsal dahulu |
| Website migration deployer | Status/ledger SELECT dan mutation yang diperlukan Prisma; CREATE pada public, ownership/ALTER untuk tabel/enums/functions/indexes/triggers, REFERENCES pada users; C4 SELECT/UPDATE/ALTER profil | Tidak memerlukan akses chatbot. Enam migrasi dari nol membutuhkan synthetic auth baseline; hosted hanya menjalankan lima migrasi pending, bukan mengulang dua Auth migration |
| Browser anon/authenticated | Sesuai kontrak Auth; authenticated hanya kolom own active public.users melalui RLS | Tidak membutuhkan ledger atau direct assessment/consultation/report tables |
| Flutter runtime | USAGE chatbot dan operasi yang disetujui atas objek miliknya; verifikasi Auth UUID melalui kontrak bersama | Tidak ada kebutuhan ledger website atau raw assessment. Hak aktual harus disepakati, bukan diasumsikan dari fixture |
| Storage server credential | Create-only PDF upload dan read-back/download melalui server-authorized code | Secret/service-role key berprivilege tidak boleh berada di browser/mobile; pemisahan key per backend tidak otomatis membatasi privilege key |

Target least privilege: pisahkan deployment dan runtime credentials per aplikasi; owner role NOLOGIN; runtime non-owner, tanpa CREATEDB/CREATEROLE/BYPASSRLS, tanpa membership lintas aplikasi; grant tabel/kolom dan kebijakan RLS ditinjau bersama. **Tidak diimplementasikan di tahap ini.** Menghapus BYPASSRLS saat tabel website tidak memiliki runtime policies akan memutus aplikasi. Grant-function/default privilege review harus mencakup identity role yang benar-benar membuat objek, tidak hanya nama schema.

Referensi semantik: [PostgreSQL privileges](https://www.postgresql.org/docs/17/ddl-priv.html), [row locking SELECT](https://www.postgresql.org/docs/17/sql-select.html), [role inheritance dan SET](https://www.postgresql.org/docs/17/role-membership.html).

## E. Rencana hardening ledger — NOT EXECUTED pada hosted

Empat berkas SQL lengkap yang dapat direview, **terpisah dari automatic migrations**:

| Tahap | Berkas | Tujuan |
| --- | --- | --- |
| A sebelum perubahan | `docs/sql/stage2b3/01-ledger-precheck.sql` | READ ONLY: owner, explicit table/column ACL, grantor/grant option, effective privilege, membership INHERIT/SET, PUBLIC, default ACL, RLS, checksum ledger |
| B remediasi | `docs/sql/stage2b3/02-ledger-remediation.sql` | Approval gate, verified owner/session/deployer, table+column REVOKE tepat satu objek, fail/rollback jika privilege tersisa atau deployer kehilangan hak |
| C sesudah perubahan | `docs/sql/stage2b3/03-ledger-postcheck.sql` | READ ONLY: browser table/column flags false, SET path kosong, setiap deployer privilege true, status ledger |
| D recovery | `docs/sql/stage2b3/04-ledger-recovery.sql` | Approval terpisah; pulihkan hanya SELECT/INSERT/UPDATE/DELETE deployer yang disetujui, tanpa PUBLIC/browser grants |

Prasyarat: owner/grantor aktual diketahui; snapshot ACL tabel+kolom dan membership disimpan oleh administrator; pilih deployer yang bukan browser/service_role; hentikan migration job paralel; tetapkan window dan persetujuan exact SQL. Skrip PostgreSQL 17 menolak grantor lain agar tidak memilih grant-chain/CASCADE yang belum direview. Jika owner bukan current_user, jangan memberi role membership otomatis; administrator harus mereview sesi eksekusi yang benar.

Inti perubahan adalah:

```sql
REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations
  FROM PUBLIC, anon, authenticated RESTRICT;
-- Script membangun daftar kolom aktual dengan quote_ident, lalu:
REVOKE ALL PRIVILEGES
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  ON TABLE public._prisma_migrations FROM PUBLIC, anon, authenticated RESTRICT;
```

Gunakan **berkas lengkap**, bukan excerpt di atas. Daftar kolom executable diambil dari katalog; tidak berasumsi table REVOKE menghapus grant kolom tersendiri. PostgreSQL juga menggabungkan privilege langsung, PUBLIC, dan inherited roles. [Dokumentasi REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).

Review marker non-secret harus diset eksplisit dalam sesi approved (`wellbeing.ledger_approval`, `wellbeing.ledger_owner`, `wellbeing.ledger_deployer`). Marker bukan sistem otorisasi database baru: pemilik proyek tetap harus menyetujui operasi. Jika effective access atau SET-only path tersisa, seluruh transaksi gagal; jangan mengubah Supabase role memberships secara otomatis. Deployer diperiksa per privilege, karena daftar privilege dipisahkan koma pada fungsi has_* berarti ANY.

Sebelum COMMIT, ROLLBACK memulihkan ACL persis. Sesudah COMMIT, jangan mengembalikan blanket GRANT ALL kepada browser. Recovery terpisah hanya untuk deployer, dengan pemeriksaan membership browser dan approval baru. Masalah ownership/DDL/default ACL memerlukan diagnosis serta proposal lain. Snapshot ACL digunakan untuk analisis, bukan auto-restore akses yang tidak aman.

## F. Hasil rehearsal terisolasi dan validasi

Perintah:

```powershell
node scripts/phase3-rehearsal.mjs --create-approved-synthetic --stage2b3
npm.cmd exec -- vitest run tests/migration-readiness.test.ts
npm.cmd test
npm.cmd exec -- tsc --noEmit
npm.cmd run lint
npx.cmd prisma validate
npm.cmd run build
git diff --check
```

Harness default tanpa flag tidak membuat database. Mode Stage 2B.3 memakai guard yang sudah ada: Docker endpoint lokal, container dan volume baru berlabel token, port ephemeral hanya 127.0.0.1, database fixed synthetic, URL marker dan identitas database diverifikasi. Environment hosted disingkirkan/ditimpa sebelum proses child; tidak ada database dump atau participant asli. Container milik invocation dihentikan di finally, volume/evidence lokal dipertahankan.

Run berhasil: `.tmp/phase3-rehearsal-2026-11-19T17-35-25.551Z/` (nama folder UTC; tanggal lokal 20 November). Docker 28.5.1, PostgreSQL **17.11**, Prisma **5.22.0**. Image digest `postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`. Container `wellbeing-phase3-30ee8348b8` sudah exited. Run awal yang berhenti saat P4002 juga sudah exited; evidence tetap tersedia.

- Enam historical migrate deploy, **6/6 tes PostgreSQL Phase 3**, C4 migrate deploy setelah ledger hardening, dan migrate status lulus.
- **33 pemeriksaan SQL lulus**, termasuk tujuh checksum, PK/index/default/nullability, negative data/access, scoped recovery, Auth trigger compatibility, dan preservation chatbot. Dua pemeriksaan sengaja menandai batas: privileged postgres dan risiko service_role yang masih terbuka, bukan bukti least-privilege sudah selesai.
- Katalog sesudah migrasi mencatat 55 constraint, 45 index public (termasuk ledger), tujuh custom trigger public dan dua trigger Auth yang tetap sama.
- Deployer non-superuser probe dapat SELECT/INSERT/UPDATE/DELETE ledger; actual migrate deploy/status tetap memakai postgres yang membuat objek. Tidak ada klaim full deployment atau application runtime sudah berjalan dengan credential least-privilege.
- Browser roles dan runtime probe tanpa privilege ditolak untuk ledger SELECT/INSERT/UPDATE/DELETE/TRUNCATE; effective REFERENCES/TRIGGER/MAINTAIN dan akses kolom juga diperiksa.
- Synthetic auth.users hanya menyediakan kolom/fungsi yang diperlukan trigger website. Ini **bukan stack Supabase Auth/GoTrue lengkap**, bukan tes signup/login/confirmation/email delivery hosted, dan bukan restore backup produksi.
- Percobaan awal berhenti pada P4002. Percobaan kedua melaporkan keterbatasan introspeksi tersebut secara eksplisit, lalu menyelesaikan katalog dan behavioral checks. Tidak ada FK atau schema Auth yang dimodifikasi untuk membuat diff lolos.

Evidence: result.json, isolation.json, checks.jsonl, stage2b3-checks.log, ledger-precheck.log, ledger-postcheck.log, schema-catalog.log, schema-diff-limitation.txt, dan execution.log yang disanitasi. Semua di `.tmp/`, diabaikan Git.

Hasil validasi lokal aktual:

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd test` | PASS: 371 tes, 27 file; termasuk 17 tes migration-readiness baru |
| `npm.cmd exec -- tsc --noEmit` | PASS, exit 0; tipe hasil query pada tes baru diperbaiki setelah pemeriksaan awal |
| `npm.cmd run lint` | PASS, 0 error; dua warning lama next/no-img-element pada src/app/page.tsx:54 dan :160 |
| `npx.cmd prisma validate` | PASS, Prisma 5.22.0, menggunakan URL placeholder lokal tanpa koneksi database |
| `npm.cmd run build` | PASS pada pengulangan, exit 0; seluruh 33 halaman berhasil dihasilkan |
| `git diff --check` | PASS; file baru juga diperiksa whitespace tanpa staging |
| Harness tanpa flag pembuatan | PASS: `node scripts/phase3-rehearsal.mjs --stage2b3` hanya memberi petunjuk, tidak membuat database |

Build memakai placeholder layanan localhost, tanpa nilai credential hosted. Percobaan dalam sandbox gagal `spawn EPERM`; build di luar pembatasan child process berhasil melakukan compile/typecheck tetapi sempat dihentikan `SecurityFatalError` berupa pemberitahuan keamanan versi Next.js. Pengulangan command yang sama selesai exit 0 dengan warning tetap muncul. Tidak ada upgrade package dilakukan; pemberitahuan keamanan ini perlu ditinjau tersendiri sebelum deployment. Tidak ada tes browser baru karena tahap ini tidak mengubah UI. Rehearsal database dan seluruh suite lokal tetap membatasi klaim hasil pada data sintetis.

Tes baru mencakup enam checksum historis, duplicate IDs, elemen NULL/array multidimensi/lower bound nonstandar, backfill dan preservation profil, default/PK/NOT NULL/FK, approval gate, inheritance, SET ROLE tanpa inheritance, table+column+PUBLIC revocation, preservation deployer/chatbot, dan recovery terbatas.

## G. Dampak Flutter dan koordinasi

Tidak ada SQL migrasi atau hardening proposal yang menarget chatbot.*. Fixture lokal meniru enam tabelnya; tidak mengadopsi schema atau ledger Flutter. Tidak ada FK baru lintas schema. auth.users/public.users identity, signup metadata requirements, role assignment, email-sync triggers dan own-profile policy tetap dipertahankan.

Checklist bersama sebelum operasi hosted:

- [ ] Flutter mengonfirmasi schema/ledger/object ownership aktual, custom role memberships dan custody service/database keys tanpa membagikan nilai secret.
- [ ] Sepakati UUID auth.users yang sama, metadata signup wajib, email confirmation/sync, inactive account, dan dampak FK RESTRICT pada penghapusan akun.
- [ ] Bekukan perubahan bersamaan; reserved public names dan semua nama enum/index/function/FK diperiksa collision. Schema terpisah tidak menghalangi collision jika Flutter memakai search_path/public.
- [ ] Tidak ada assessment/score/PDF sharing baru tanpa consent dan kontrak API yang disetujui; tidak memakai ledger website untuk migrasi Flutter.
- [ ] Sepakati role runtime/deployer masing-masing serta review service_role dan creator default grants; jangan mengubah broad public defaults sepihak.
- [ ] Tentukan window, backup/restore operator, rollback aplikasi/forward database recovery, joint smoke tests dan penanggung jawab UAT.

## H. Storage readiness

Implementasi yang ditinjau: `src/lib/reports/storage.ts`, service PDF, dan download/generate routes. Bucket wajib **assessment-reports**, private. Modul Storage membaca nama environment **NEXT_PUBLIC_SUPABASE_URL** dan **SUPABASE_SECRET_KEY** (server-only); Auth memakai konfigurasi publishable key terpisah. Database menggunakan DATABASE_URL dan DIRECT_URL. Tidak ada nilai credential diminta, dicetak, atau ditulis ke dokumen.

Server mengecek participant ownership/consent, membuat key deterministik dari UUID tervalidasi, upload `upsert:false`, membaca ulang PDF dan memvalidasinya sebelum status GENERATED; unduh memeriksa izin lagi sebelum respons. Tidak mengirim object key/public URL/signed URL ke klien. [Private bucket Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals).

Secret/service-role keys memiliki akses tinggi dan dapat melewati RLS; private bucket saja tidak membatasi backend yang memegang credential tersebut. Batasi custody, jangan kirim ke Flutter/browser, audit deployment secret handling, dan review scope/default grants bersama. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Konfigurasi manual hanya setelah approval: buat bucket private dengan nama tepat; review MIME application/pdf, batas ukuran berdasarkan PDF sintetis, retention/backup dan access policies tanpa public read; sediakan secret server lewat secret manager. Uji dengan akun dan data sintetis pada lingkungan approved: generation PENDING→GENERATED, create-only conflict, retry setelah kegagalan, download byte/nama file, wrong owner/role, revoked/expired consent, missing/corrupted artifact, serta penolakan direct Storage read oleh anon/authenticated. Tidak membuat bucket atau mengupload apa pun ke hosted pada tahap ini.

## I. Rencana deployment produksi — proposal saja

1. **Koordinasi/approval:** sign-off owner dan Flutter atas exact migration hashes, SQL ledger, credential/deployer, exposure, Storage, window dan stop criteria. Jangan bundle role/default-ACL changes yang belum direview.
2. **Backup/restore:** backup terproteksi untuk data/schema/ACL/migration history dan artefak; verifikasi checksum serta uji restore pada target terisolasi. Backup yang ada bukan bukti restore terbaru berhasil. Tidak menyalin produksi pada rehearsal ini.
3. **Preflight READ ONLY approved:** ulangi baseline, history/checksums, collision semua nama public, ownership, grants kolom/membership/default ACL, privilege deployer, data C4 invalid, dan dependensi Flutter. Audit reachability Data API secara read-only terpisah; tidak menyimpulkan exploit dari ACL saja.
4. **Window:** hentikan concurrent migration jobs; koordinasikan trafik/write terkait. Tetapkan rollback aplikasi dan batas lock timeout. Hosted harus mempertahankan dua applied migration; yang diterapkan adalah empat pending historis ditambah C4.
5. **Ledger remediation approved:** snapshot ACL, jalankan script terpisah sebagai verified owner, verifikasi deployer dan browser denial. Rehearsal membuktikan migration berikutnya tetap bisa berjalan sesudah hardening. Bila inheritance/grantor berbeda, abort dan review ulang, jangan CASCADE atau broad REVOKE.
6. **Migrate deploy approved:** gunakan Prisma 5.22 dan credential deployer yang dipilih; verifikasi tujuh records/checksums, finished/rolled_back flags, PK, array constraints/defaults, FK, partial indexes, triggers, RLS dan effective grants. Jangan menjalankan db push/reset.
7. **Gate hak service_role/runtime:** hasil migrasi tidak otomatis menutup risiko default grants. Sebelum UAT dengan data sensitif, selesaikan review/persetujuan remediasi role/default ACL terpisah dan uji workflow di bawah credential yang benar.
8. **Storage approved:** konfigurasi private bucket, server credentials/policies dan synthetic reports sesuai H.
9. **Joint smoke/UAT:** existing-user login, signup metadata/confirmation/email sync; Flutter histories/schema; assessment quota/immutability; availability/booking concurrent; fresh consent/revocation/expiry; PDF generation/download dan unauthorized denials. Pengisian approved instruments/period dan akun uji membutuhkan izin data tersendiri.
10. **Failure handling:** hentikan rollout pada checksum/collision/privilege/trigger failure. Migration transaksi rollback; cek failed ledger record sebelum Prisma resolve/retry yang direview. Jika migrasi sudah committed, rollback aplikasi dan pertahankan tabel/data additive; gunakan forward correction, bukan drop/reset/overwrite history. Recovery ledger hanya seperti E; recovery Storage GENERATED mengikuti kebijakan terpisah. Restore produksi memerlukan approval dan koordinasi Flutter.

UAT/production readiness masih **bersyarat**, bukan selesai hanya karena rehearsal lulus.

## J. Checklist approval eksplisit

- [ ] Owner: koneksi/preflight hosted dan audit REST/GraphQL read-only dengan scope yang ditentukan.
- [ ] Owner + Flutter: window, collision/ownership review dan backup/restore bersama.
- [ ] Owner: penerapan empat pending migration dan C4 dengan hash persis; Flutter menyetujui dampak schema/identity bersama.
- [ ] Owner/security: ledger table+column revocation, owner/deployer terpilih, dan recovery jika dibutuhkan.
- [ ] Owner + Flutter/security: setiap perubahan role membership, BYPASSRLS, service_role privileges, RLS/default ACL, schema exposure atau automatic exposure. Belum termasuk perubahan executable tahap ini.
- [ ] Owner: pembuatan/configuration private Storage bucket/policy serta penyediaan/rotasi secret server melalui jalur aman.
- [ ] Owner + Flutter: test accounts/data sintetis approved, deployment aplikasi, smoke/UAT dan incident recovery.
- [ ] Owner: setiap Prisma migrate resolve, repair data invalid, restore, atau perubahan setelah failure; tidak ada persetujuan implisit dari keberhasilan rehearsal.

Tidak ada approval hosted yang diminta untuk menyelesaikan persiapan ini. Semua operasi hosted menunggu instruksi/persetujuan eksplisit berikutnya.

## Berkas berubah dan ringkasan diff

Sembilan berkas baru:

1. `prisma/migrations/20261120000000_psychologist_profiles_integrity/migration.sql`
2. `docs/sql/stage2b3/01-ledger-precheck.sql`
3. `docs/sql/stage2b3/02-ledger-remediation.sql`
4. `docs/sql/stage2b3/03-ledger-postcheck.sql`
5. `docs/sql/stage2b3/04-ledger-recovery.sql`
6. `scripts/stage2b3-rehearsal-checks.mjs`
7. `tests/rehearsal/stage2b3-postchecks.sql`
8. `tests/migration-readiness.test.ts`
9. `docs/STAGE2B3-DATABASE-READINESS.md`

Satu berkas dimodifikasi: `scripts/phase3-rehearsal.mjs` (+16/-1), menambahkan mode Stage 2B.3, diagnostic yang disanitasi, serta penghentian container milik invocation sendiri sambil mempertahankan volume/evidence. Total sepuluh berkas; file baru tetap untracked karena tidak ada staging atau commit. `git diff --stat` biasa hanya menghitung perubahan pada file tracked. Tidak ada perubahan schema.prisma, enam migration historis, kode aplikasi, secret environment, package.json atau lockfile. Artefak rehearsal tetap lokal di `.tmp/` dan tidak masuk diff.
