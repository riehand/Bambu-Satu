# Penyelesaian blocker R1–R3

**Status terbaru: R2 PASS (metadata), R3 BLOCKED, R1 BLOCKED (issuer/renewal).** Pemeriksaan read-only yang kemudian disetujui telah selesai. Tidak ada migration, pembuatan bucket/account, aktivasi LOGIN, perubahan credential/JWT, deployment, atau Docker. Tidak membaca data pengguna/asesmen/laporan/pesan Flutter. Bagian persiapan di bawah dipertahankan sebagai riwayat; hasil aktual berikut menggantikan status izin/pemeriksaan sebelumnya.

## Hasil metadata yang disetujui — 26 November 2026

- Target `bofoowyzlnfhwcstlmgp`: cocok antara URL Auth konfigurasi dan username project pada Supabase session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`. Tidak melakukan login/signup atau request data Auth.
- Psql 17 menggunakan `sslmode=verify-full` dengan CA publik Supabase yang hash-nya cocok salinan sebelumnya. Koneksi melaporkan **TLSv1.3 / TLS_AES_256_GCM_SHA384**. PostgreSQL 17.11, database postgres, session operator postgres (bukan credential runtime aplikasi).
- Exact script `metadata-readonly.sql`, SHA-256 `28f6b950c068d74240cfd7ee138e90c8bc04052a25016fa64d9b432e4e7dd6cd`, berjalan 2026-11-26 16:19:57–16:20:05 UTC (23:19:57–23:20:05 WIB). `transaction_read_only=on`, REPEATABLE READ, statement timeout 15 detik, lock timeout 3 detik, selesai **ROLLBACK**, exit 0. Selain script hanya perintah client `\conninfo` untuk bukti TLS; tidak ada query tambahan di luar script.
- Bukti metadata privat/ignored: `.tmp/hosted-metadata-review/execution.json`, `metadata.csv`, `parsed.json`, `findings.json`. Tidak mencetak password, key, URL bercredential atau function bodies. Metadata disimpan lokal; tidak ada dump data aplikasi. Percobaan awal terblokir subprocess sandbox EPERM sebelum koneksi; eksekusi yang disetujui di luar sandbox berhasil.

### R2 — PASS untuk policy existing

`storage.objects` dan `storage.buckets` keduanya RLS aktif; **0 policy existing** pada keduanya. Bucket `assessment-reports` **belum ada**. Tidak ditemukan policy existing yang membuka bucket baru. Anon/authenticated mempunyai grants CRUD pada tabel Storage, tetapi tanpa policy RLS mereka tidak otomatis mendapat akses baris. Service_role tetap BYPASSRLS dan owner Storage tetap privileged; keduanya tidak digunakan sebagai credential scoped worker.

PASS ini menutup ketidakpastian policy existing, bukan acceptance upload/download: bucket, role dan policy baru belum diterapkan. Draft restrictive boundary tetap dipertahankan untuk mencegah policy permissive yang ditambahkan kelak membuka bucket laporan.

### R3 — BLOCKED karena ledger migration terlalu terbuka

Yang PASS:

- Dua baseline `init_users` dan `supabase_auth` applied dengan checksum exact. Enam migration lainnya `PASS_PENDING`; tidak ada failed/unexpected ledger entry dalam snapshot.
- Perbandingan offline terhadap inventaris pending tidak menemukan benturan nama tabel/index/type/function/constraint/trigger/policy/schema/role. Role tambahan `wb_report_storage` juga belum ada.
- Tidak ada global default ACL yang tercatat; default grants yang luas berada pada schema public/storage, bukan schema `wb_guard`/`wb_pdf` baru. Paket gateway sudah mencabut grants tabel website baru secara eksplisit; default ACL global/shared tidak perlu diubah untuk itu.
- Anon/authenticated tidak mempunyai jalur SET ROLE ke role elevated dalam metadata yang diperiksa. Authenticator dapat SET anon/authenticated/service_role; Storage admin dapat SET authenticator dan role turunannya. Ini menjelaskan jalur impersonation managed Storage; tidak menguji perubahan membership baru.
- `public.users` tetap RLS aktif; authenticated hanya memperoleh grants SELECT kolom profil existing. Tidak ada akses password_hash yang ditambahkan oleh pekerjaan ini.

**Temuan aktual yang menghalangi GO:** `public._prisma_migrations` milik postgres memiliki RLS **nonaktif** dan hak efektif **SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER** untuk **anon dan authenticated**. Ini memberi kewenangan database yang tidak diperlukan browser terhadap ledger. Tidak mencoba membuktikannya dengan membaca/menulis melalui REST dan tidak menyimpulkan ledger telah dimanipulasi. Checksum yang cocok saat snapshot tidak menghilangkan risiko perubahan ledger berikutnya.

Default ACL postgres pada public memberikan grants luas ke anon/authenticated/service_role untuk tabel baru; grants tersebut juga tampak pada ledger existing. Gateway sengaja mengecualikan ledger untuk menjaga lingkup review sebelumnya, sehingga paket sekarang **tidak memperbaiki temuan ini**.

Rekomendasi perubahan terpisah, **belum disiapkan sebagai izin eksekusi dan belum dijalankan**: cabut akses tabel/kolom ledger dari anon/authenticated (dan PUBLIC bila ada), pertahankan owner/operator Prisma, jangan menghapus/mengubah isi ledger, tidak mengulang baseline, tidak mengubah global default ACL atau schema chatbot. Tinjau service_role terpisah sesuai kebutuhan operator; tidak mencabutnya diam-diam. Sesudah persetujuan perubahan sempit tersebut, cocokkan ulang checksum dan hak efektif sebelum migration. Ini mengubah ACL objek existing sehingga harus masuk paket persetujuan baru.

Owner tabel Storage adalah `supabase_storage_admin`, sedangkan postgres memiliki grant options tabel/schema yang relevan. Metadata grants bukan bukti kewenangan menjalankan setiap CREATE POLICY pada managed Storage; jalur operator yang didukung Supabase perlu dipastikan saat menyiapkan eksekusi, tanpa mengubah ownership atau mencoba DDL pada pemeriksaan ini.

### Rekomendasi R1 — penerbitan dan pembaruan JWT

Prioritaskan rancangan **Supabase Auth custom access-token hook untuk identitas mesin khusus**, jika pemilik shared menyetujui perubahan konfigurasi Auth. Signing tetap dikelola Supabase; worker tidak memegang project JWT secret atau service_role key. Hook memilih subject mesin dari allowlist yang hanya operator dapat mengubah, menetapkan role `wb_report_storage` hanya untuk subject itu, mempertahankan claims pengguna lain, dan tidak mempercayai user_metadata.

Worker hosted memakai session mesin terpisah dan refresh token server-only. Jalankan satu refresh terkoordinasi sebelum expiry, simpan refresh token hasil rotasi secara privat/atomik agar restart tidak memakai token lama, validasi ulang issuer/subject/role setiap refresh, dan berhenti jika refresh gagal atau token expired. Gunakan token pendek (misalnya 15 menit, maksimum satu jam sesuai adapter). Jangan menyimpan token di website/browser, Git, atau mengharuskan developer memperbarui JWT manual. [Auth hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) dan [refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession) menyediakan mekanisme dasarnya; desain penyimpanan/koordinasi worker masih perlu implementasi setelah keputusan.

Prasyarat yang belum diverifikasi oleh query metadata ini: konfigurasi hook Auth existing di Dashboard dan provisioning identitas mesin yang kompatibel dengan trigger profil existing. Jangan membuat akun mesin menjadi partisipan klinis aktif atau mengubah trigger pengguna untuk memudahkan setup. Rancangan hook harus ditinjau bersama pemilik Flutter karena berlaku pada project yang sama. Belum ada akun/session/token/hook dibuat.

Jika perubahan Auth bersama tidak disetujui, gunakan issuer tepercaya existing dengan signing authority di luar worker dan kontrak renewal yang dibatasi; jangan memindahkan project signing key ke worker sebagai jalan pintas. Adapter JWT env saat ini tetap fail-closed dan **belum merupakan renewal otomatis**.

Tidak menjalankan tes aplikasi ulang pada langkah ini: perubahan hanya dokumentasi hasil dan executor sementara yang menjalankan script read-only yang disetujui. Tidak ada konfigurasi database diperbaiki otomatis.

## R1 — Scoped Storage worker

Supabase mendukung [custom role/JWT untuk Storage](https://supabase.com/docs/guides/storage/schema/custom-roles). Signature JWT tetap diverifikasi oleh Supabase. Memberi project signing secret kepada worker memungkinkan pemalsuan role lain; itu bukan pembatasan hak. [Secret API project](https://supabase.com/docs/guides/getting-started/api-keys) juga tidak dapat dibatasi dengan RLS.

Implementasi:

- `src/lib/reports/hosted-storage.ts`: hosted/staging hanya menggunakan publishable API key dan bearer JWT `wb_report_storage`. Memeriksa project issuer, subject worker, audience, role, waktu berlaku maksimum satu jam, dan expiry pada setiap request; token tidak dibuat oleh worker. Pemeriksaan claims lokal hanya validasi konfigurasi, bukan verifikasi signature. Secret project yang dikenal ditolak. Redirect HTTP ditolak.
- `src/lib/reports/storage.ts`: jalur hosted/staging tidak memakai secret fallback; adapter lama dengan secret hanya dapat digunakan pada loopback fixture opsional. Hosted URL tanpa runtime mode juga ditolak.
- `src/lib/reports/staging-worker-server.ts`: pemeriksaan bucket private memakai client scoped yang sama. Rendering, input resmi dari DB, create-only upload, read-back, hash, consent dan finalisasi existing dipertahankan.
- Env **khusus worker**, bukan website/browser: `WELLBEING_STORAGE_WORKER_JWT`, `WELLBEING_STORAGE_WORKER_SUB`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, project URL/ref dan runtime mode, di samping credential restricted DB/attestation worker existing. Jangan memasukkan JWT worker ke variabel `NEXT_PUBLIC_*`. Tidak mengubah file env privat.

Draft `storage-role.sql` tidak dipanggil otomatis oleh aplikasi/build/generator. Menambah satu role **NOLOGIN NOBYPASSRLS** `wb_report_storage`, membership SET-only untuk `authenticator`, schema USAGE dan SELECT/INSERT objects serta SELECT buckets. Tidak memberi membership anon/authenticated/service_role. Tidak membuat password, token, bucket, atau Auth account.

Sepuluh policy tambahan pada `storage.objects`/`storage.buckets`:

- `wb_reports_boundary`, `wb_reports_bucket_boundary`: restrictive, mencegah role non-worker mengakses bucket baru; kondisi selalu true untuk bucket lain sehingga tidak membatasi akses existing di sana.
- `wb_storage_scope`, `wb_storage_read`, `wb_storage_create`: worker hanya membaca/membuat path `reports/<uuid>.pdf` pada `assessment-reports`.
- `wb_storage_no_update`, `wb_storage_no_delete`: menolak overwrite/delete bahkan jika ada grant/policy PUBLIC permissive.
- `wb_storage_bucket_scope`, `wb_storage_bucket_read`, `wb_storage_bucket_no_delete`: hanya membaca metadata bucket private, tidak membuat/mengubah/menghapus bucket.

Tidak ada policy existing yang dihapus/diubah. Restrictive policy existing dapat tetap menolak worker; jangan menghapusnya untuk memaksa kompatibilitas. Owner/service_role tetap dapat melewati RLS: draft ini tidak mengubah kewenangan mereka. Review metadata harus memastikan PUBLIC/schema/default grants tidak memberi kewenangan di luar dua tabel Storage.

**Batas yang masih nyata:** scoped credential membatasi worker pada seluruh bucket laporan, bukan per-report. Otorisasi job/consent tetap dilakukan gateway existing sebelum worker membaca/membuat PDF. Kompromi worker masih berisiko terhadap isi bucket laporan, tetapi credential tersebut tidak dirancang memberi akses bucket Flutter, Auth admin atau signer project. Hak efektif target belum terverifikasi.

### Keputusan issuer yang diperlukan

Adapter menerima JWT dari env server-only dan menolak jika tidak tersedia/kedaluwarsa. Ini belum menyediakan pembaruan token otomatis; jangan mengklaim operasional hosted tanpa issuer. Tidak ada token dibuat pada pekerjaan ini.

| Pilihan | Konsekuensi |
| --- | --- |
| Issuer tepercaya yang sudah dikelola pemilik project | Token pendek dihasilkan/diperbarui di luar worker. Signing authority tetap sangat tinggi dan harus dikustodi terpisah; memerlukan target layanan dan kontrak renewal yang disetujui. Memasukkan secret signer ke worker bukan pilihan aman. |
| [Supabase Auth custom access-token hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) untuk identitas mesin khusus | Dapat memakai signing yang dikelola Auth dan refresh session; memerlukan desain hook, identitas mesin, dan pemeriksaan kompatibilitas trigger/profile Auth existing. Konfigurasi hook bersifat project-wide sehingga harus direview bersama pemilik Flutter; tidak dipasang diam-diam. |

Rekomendasi: gunakan issuer existing bila memang tersedia; bila tidak, putuskan dahulu apakah pemilik shared mengizinkan jalur Auth hook. Jangan membangun broker baru atau memindahkan signing secret sebelum keputusan tersebut. JWT env pendek hanya batas adapter yang aman, bukan solusi renewal final. Validasi end-to-end signature, role impersonation Storage dan refresh menunggu target/issuer disetujui.

## R2/R3 — Paket query read-only siap ditinjau

File: `metadata-readonly.sql`. **Belum dijalankan pada hosted.** Tidak terhubung ke `npm run dev`, build, CI, atau launcher.

Ruang lingkup izin yang diminta untuk langkah berikutnya: project **bofoowyzlnfhwcstlmgp**, satu session metadata dengan `BEGIN ... READ ONLY`, snapshot repeatable-read, statement timeout 15 detik, lock timeout 3 detik, berakhir ROLLBACK. Verifikasi hostname/ref koneksi dan TLS sebelum membuka session; jangan mencetak URL/credential. Pengaturan SQL sendiri tidak membuktikan identitas project.

Yang dibaca:

- Policy expressions, role, command dan sifat permissive/restrictive pada `storage.objects`/`storage.buckets`; konfigurasi bucket `assessment-reports` jika sudah ada. **Tidak membaca baris storage.objects atau nama/file objek.**
- Namespace/table/index/type/function identities, owner, ACL, RLS, trigger dan constraint untuk ruang nama website/Storage yang relevan; metadata trigger `auth.users`, tanpa baris Auth. Tidak mengambil function bodies atau key/password.
- Default ACL global/schema, pg_roles tanpa password, direct membership dan effective INHERIT/SET, hak efektif tabel/schema dan column ACL. Role yang belum dibuat belum memiliki hak efektif untuk diuji.
- Ledger migration nama/checksum/status, tanpa kolom logs. Query membandingkan exact hash delapan file dari manifest: dua harus `PASS_BASELINE`, enam harus `PASS_PENDING`; unexpected/failed/drift = BLOCKED. Tidak menulis ledger atau resolve migration.

Cara menilai hasil, tanpa menganggap query sukses berarti GO:

1. Policy Storage yang berlaku kepada PUBLIC/anon/authenticated atau role yang diwarisi dan tidak secara tegas mengecualikan bucket baru adalah kandidat akses lintas bucket. Ekspresi fungsi/OR/dinamis yang belum terbukti aman tetap BLOCKED; jangan menebak keamanan dengan pencarian string bucket saja. Default-deny juga bukan bukti worker berfungsi bila policy restrictive existing menolaknya.
2. Cocokkan nama objek dengan `OBJECT-INVENTORY.json` ditambah satu role dan sepuluh policy Storage di atas. Objek pending yang sudah ada, role dengan membership tak diharapkan, atau schema `wb_crypto`/`wb_guard`/`wb_pdf` existing harus ditinjau; jangan DROP atau overwrite.
3. Periksa default grant terhadap objek baru, termasuk signing_key dan fungsi SECURITY DEFINER; periksa akses yang berasal dari PUBLIC, grant kolom, indirect membership dan SET ROLE. Raw ACL dan effective table rights harus dibaca bersama. Catalogue snapshot tidak membuktikan future grants aman atau ketersediaan endpoint Storage.
4. Jika hasil perlu perubahan pada objek/policy Flutter atau baseline, hentikan dan ajukan perubahan terpisah. Jangan menyelesaikannya dengan service-role fallback.

## Validasi perubahan aktual

- 32 tes terarah awal PASS: adapter JWT 13, Storage existing 3, worker existing 12, policy SQL 4.
- Ditambah dua tes query metadata in-memory: file policy/metadata final **6/6 PASS**, sehingga total 34 tes terarah pada versi masing-masing yang diuji. Kegagalan fixture pertama karena kolom metadata bucket belum dimodelkan telah diperbaiki; query produksi tidak dilonggarkan.
- PostgreSQL in-memory PGlite menguji policy terhadap grants dan policy PUBLIC yang sengaja permisif, serta read-only/klasifikasi baseline dan penolakan checksum drift. Tidak memakai Docker, database bersama, data klinis atau credential hosted. Ini tidak membuktikan kompatibilitas Storage API hosted.
- `npm.cmd exec -- tsc --noEmit`: PASS. ESLint terarah pada tiga file implementasi dan tiga file tes yang berubah: PASS. `git diff --check`: PASS (peringatan normalisasi LF/CRLF pada file lama). Tidak mengulang full regression.

## Persetujuan terpisah yang masih dibutuhkan

1. **Sekarang:** izin menjalankan hanya `metadata-readonly.sql` pada target terverifikasi. Ini tidak memberi izin SQL mutation, bucket, role, credential atau deployment.
2. Keputusan issuer/renewal JWT di atas; rancangan final bergantung pada pilihan tersebut.
3. **Setelah hasil metadata dan issuer ditutup:** persetujuan paket mutation final (enam migration, gateway, tambahan scoped Storage role/membership/policy, dua login DB restricted, bucket private) beserta perubahan yang muncul dari review. Tidak otomatis disetujui oleh izin query metadata.

Target workflow website tetap `npm run dev` pada localhost:3000 dengan backend hosted yang sama untuk tim. Signer/worker dikonfigurasi sebagai layanan hosted sekali, bukan prasyarat service lokal setiap developer. Chat/lifecycle/konten asesmen belum disahkan tetap tidak diaktifkan.
