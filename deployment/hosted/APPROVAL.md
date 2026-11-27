# Persetujuan perubahan additive hosted WellBeing Hub

**Pembaruan 27 November 2026:** [paket penutupan R1/R3](BLOCKER-CLOSURE-APPROVAL.md) memuat patch ledger, hook Auth mesin, refresh worker, dampak Auth bersama dan tindakan persetujuan. Status historis issuer/metadata di bawah harus dibaca bersama pembaruan tersebut. Eksekusi hosted masih BLOCKED; tidak ada izin mutation yang diberikan.

Target terverifikasi read-only: **`bofoowyzlnfhwcstlmgp`**, PostgreSQL 17.11. Auth dan database cocok; dua baseline applied dengan checksum identik. Enam objek tabel `chatbot` teridentifikasi melalui katalog, tanpa membaca isinya. Operator mempunyai grant option schema `public` dan `extensions`; credential operator tidak boleh dipakai aplikasi.

**Status: BLOCKED untuk eksekusi, menunggu penutupan temuan [final review](FINAL-REVIEW.md) dan persetujuan berikutnya.** Belum ada SQL/bucket/akun/data hosted diubah oleh paket ini. Snapshot kode awal sesi ini adalah `b840419` (sesudah `ced3f1d`); perubahan pengguna dipertahankan. Tidak ada commit/push/deploy pada pekerjaan ini.

**Hasil pemeriksaan read-only yang disetujui:** [R2 PASS, R3 BLOCKED](R1-R3-RESOLUTION.md#hasil-metadata-yang-disetujui--26-november-2026). Script metadata selesai melalui TLS verify-full dan ROLLBACK. Ledger `_prisma_migrations` ternyata memberi anon/authenticated hak baca/tulis termasuk TRUNCATE tanpa RLS; perlu persetujuan koreksi ACL terpisah. Issuer/renewal worker R1 tetap belum diterapkan. Izin read-only tidak mencakup draft tindakan mutation di bawah.

Final review 26 November 2026 tidak menjalankan SQL, termasuk query metadata hosted. Bukti identitas berasal dari pemeriksaan sebelumnya. Manifest dan SQL di bawah adalah paket yang ditinjau, bukan izin eksekusi. Secret Storage tingkat project belum memenuhi pembatasan bucket; policy Storage/default ACL dan potensi benturan nama belum seluruhnya tercakup dalam bukti target. Lihat [inventaris objek](OBJECT-INVENTORY.json) dan rencana pemulihan dalam final review.

**Pembaruan R1–R3:** lihat [hasil implementasi blocker](R1-R3-RESOLUTION.md). Adapter hosted worker kini menolak service-role secret dan memerlukan JWT `wb_report_storage`. [Draft role/policy Storage](storage-role.sql) merupakan tambahan terpisah yang belum disetujui atau dijalankan; [query metadata read-only](metadata-readonly.sql) juga belum dijalankan pada hosted. Issuer/renewal JWT dan bukti metadata masih BLOCKED. Inventaris JSON dan hash final review sebelumnya tetap merepresentasikan gateway/migration lama; tambahan Storage dicatat pada dokumen pembaruan.

## Draft tindakan setelah temuan ditutup dan persetujuan diberikan

1. Terapkan **enam pending migration** pada [manifest migration](migrations.json) dengan Prisma 5.22 `migrate deploy`, setelah verifikasi ulang target dan dua checksum applied. Baseline `init_users` dan `supabase_auth` tidak diulang, tidak diubah dan tidak ditandai applied secara palsu. Tidak ada reset/db push.
2. Terapkan [gateways.sql](gateways.sql) dalam satu transaksi dengan `ON_ERROR_STOP`, hanya pada target di atas dan session `wellbeing.approved_hosted_ref` yang cocok. Artifact dibuat oleh `node scripts/prepare-staging-sql.mjs bofoowyzlnfhwcstlmgp --shared`; checksum sumber ada pada [manifest gateway](manifest.json). Pengaturan session adalah konfirmasi operator, bukan pengganti pemeriksaan hostname/ref koneksi.
3. Aktifkan LOGIN untuk **dua role baru**, `website_runtime` dan `wb_pdf_worker`, dengan password acak terpisah yang disimpan privat. Keduanya bukan owner/BYPASSRLS/superuser dan tidak mendapat membership yang memperluas hak. Jangan mengubah password role existing. Key signing baru dibuat oleh pgcrypto pada schema baru, bukan disalin dari fixture.
4. Buat bucket baru `assessment-reports` sesuai [storage-bucket.json](storage-bucket.json): private, PDF, maksimal 5 MiB. Jangan membuat policy anon/public, signed URL publik, atau menyalin object lokal. Jika bucket sudah muncul sejak pemeriksaan, hentikan dan tinjau konfigurasinya.

Persetujuan ini **tidak** mencakup deployment layanan, seed konten DASS/WEMWBS, promosi akun/perubahan role existing, aktivasi lifecycle/chat, perubahan schema/data Flutter atau deployment Vercel. Akun uji dan konten yang disahkan diperlukan untuk acceptance hosted; tidak akan mengimpor data sintetis lokal.

## Dampak dan batas perubahan

- Migration membuat tabel/enum/index/trigger website untuk asesmen, profil/jadwal, booking, consent/audit, dan schema pesan. Schema pesan bukan izin mengaktifkan chat.
- Gateway menambah schema `wb_guard`, `wb_crypto`, `wb_pdf`, role NOLOGIN untuk scoring/proyeksi/booking/consent/PDF, policy RLS dan fungsi dengan grants terbatas. RLS tetap aktif. Data official score dihasilkan gateway existing, bukan input skor browser.
- `public.users` tetap memakai data, ownership, Auth triggers, grants/policy existing. Tambahan hanya grants/policy untuk role baru serta trigger penjaga mutasi yang berlaku saat `current_user='website_runtime'`. Tidak mencabut akses `service_role` existing pada users dan tidak mengubah `_prisma_migrations` ACL/RLS.
- Grants default pada **tabel website baru** dicabut dari public/anon/authenticated/service_role sebelum diberi jalur restricted. Ini tidak mengubah `chatbot.*`, default privileges global, platform roles atau tabel lama Flutter.
- Operator mendapat membership/CREATE schema sementara untuk menetapkan owner fungsi NOLOGIN; hak sementara dicabut dalam transaksi yang sama. Tidak diberikan kepada login runtime/worker.
- Schema gateway first-time bukan idempotent. Jika role/schema nama sama muncul atau migration gagal, berhenti; jangan drop/reset/retry buta. Migration Prisma dan gateway bukan satu transaksi gabungan: migration sukses dapat tetap ada bila gateway gagal. Fitur tetap unavailable sampai paket lengkap berhasil, tanpa fallback owner.

## Arsitektur developer dan deployment

Website tetap satu Next.js: Supabase Auth session, restricted Prisma/DAL, service Sprint 1–3 dan RLS/gateway yang sama pada localhost dan Vercel. Tidak ada client owner. Developer hanya membutuhkan env privat yang sudah dikonfigurasi sekali dan `npm ci` → `npm run dev`.

Untuk kontrak DAL existing, signer hosted masih dipertahankan: koneksi Prisma bukan PostgREST sehingga `auth.uid()` tidak otomatis terverifikasi dari cookie; menerima `SET sub` tanpa bukti akan memungkinkan pemalsuan identitas. Signer memverifikasi access token ke Auth project yang dipatok dan mengikat claim ke transaksi. Memindahkan semua Prisma queries ke PostgREST RPC adalah perubahan DAL yang jauh lebih besar, bukan syarat membuka fitur existing.

PDF worker juga dipertahankan **sebagai layanan hosted sekali konfigurasi**, agar website tidak memegang credential Storage ataupun kunci finalisasi artifact. Adapter hosted yang diperbarui memerlukan JWT role Storage khusus, bukan secret project. Worker memakai role DB sendiri, input resmi gateway, upload private create-only, verifikasi read-back, dan attestation. Signer dan worker bukan proses wajib di laptop. Issuer/renewal JWT Storage masih memerlukan keputusan arsitektur. Deploy layanan membutuhkan target hosting dan instruksi deployment tersendiri; belum ada endpoint aktif dan tidak ada janji semua fitur langsung aktif hanya setelah migration.

## Validasi aktual sebelum persetujuan

- Paket delapan migration (termasuk baseline untuk DB uji kosong) dan gateway berhasil dieksekusi pada PostgreSQL 17 sementara, **network none**, sebagai operator non-superuser CREATEROLE. Memperbaiki hak SET ROLE/ownership dan urutan proyeksi yang memerlukan schema PDF. Container sementara dihentikan/dihapus otomatis; stack/data lokal existing tidak diubah. Ini pemeriksaan paket SQL baru, bukan acceptance hosted.
- 46 tes terarah PASS: register/Auth, identity staging/hosted, dan gate institusi. Registrasi tidak lagi membaca Prisma sebelum signUp; error trigger/constraint tidak diklaim sukses.
- TypeScript PASS; lint PASS.
- Belum ada SQL hosted, bucket creation, akun baru, data klinis, atau acceptance hosted. Setelah persetujuan dan setup selesai: cocokkan ledger/checksum, fingerprint katalog Flutter/ACL users, bootstrap role restricted, lalu satu acceptance browser menggunakan akun sah dan konten yang disetujui.
