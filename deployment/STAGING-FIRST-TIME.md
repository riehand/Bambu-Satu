# Supabase staging + Vercel Preview — first-time setup

Status: **PARTIAL — kode adapter dan layanan tersedia; belum deployed, belum ada URL demo.**
Target: staging terpisah, bukan proyek Supabase bersama Flutter. Dokumen ini bukan otorisasi provisioning atau SQL. Historical migrations tidak diubah. Tidak ada seed konten asesmen produksi.

## Keputusan yang diperlukan dari pemilik

Berikan nama organisasi/team, nama proyek staging, region, batas biaya (termasuk pilihan free jika tersedia), Vercel team/project dan alias preview stabil. Pilih penyedia hosting signer/PDF worker yang mendukung Node.js 22 serta reverse proxy HTTPS ke loopback. Jangan mengirim password/token/key melalui chat. Persetujuan pembuatan proyek, penerapan SQL, penyimpanan secrets dan deployment adalah tindakan terpisah.

## Dashboard Supabase (setelah target disetujui)

1. Dari organisasi yang dipilih, **New project** → nama staging khusus WellBeing Hub, region dan plan yang disetujui. Jangan gunakan project ref tim Flutter. Simpan password database di password manager. Jangan membuat Auth user sebelum baseline Auth selesai.
2. **Project Settings → General**: catat project ref non-secret. **Connect**: salin hostname direct/session pooler dan database `postgres`. **Settings → API Keys**: gunakan publishable key untuk website dan signer; secret key terpisah untuk worker saja. Jangan menggunakan secret key di browser/website/signer.
3. Gunakan PostgreSQL 17 atau lebih baru (pemeriksaan membership memakai privilege SET). Pastikan `pgcrypto` tersedia di schema `extensions` melalui **Database → Extensions**. Jangan memindahkan extension platform untuk memenuhi script.
4. Setelah persetujuan SQL, operator memakai sesi pemeliharaan terpisah dengan target yang dicocokkan dari Dashboard. Verifikasi database kosong dari objek website, tidak ada schema `chatbot`, dan belum ada Auth users. Credential operator tidak pernah menjadi `DATABASE_URL` Vercel.

### Migration historis: urutan penuh, bukan resolve palsu

Gunakan CLI Prisma **5.22 dari lockfile** (`npm ci`), dengan `DATABASE_URL` dan `DIRECT_URL` operator yang secara eksplisit menunjuk staging dalam proses terpisah. Jangan mengambil env developer/shared. Jalankan `npm exec -- prisma migrate status`, lalu setelah persetujuan `npm exec -- prisma migrate deploy`. Perintah deploy menerapkan seluruh migration pending menurut urutan berikut, termasuk baseline terlebih dahulu; jangan memakai `db push`, reset, atau mengisi ledger dengan `migrate resolve` tanpa eksekusi:

1. `20261021144827_init_users` — baseline public users.
2. `20261023000000_supabase_auth` — baseline Auth trigger/own-profile RLS.
3. `20261023010000_phase2_assessment`.
4. `20261028000000_psychologist_profiles`.
5. `20261029000000_psychologist_availability`.
6. `20261029000001_appointments_report_consent`.
7. `20261120000000_psychologist_profiles_integrity`.
8. `20261121000000_consultation_messages` — schema saja; chat tetap nonaktif.

Verifikasi delapan ledger entries/checksum sesuai source. Jika ada data/policy/ledger lain, berhenti dan tinjau target; jangan menghapusnya. Build Vercel tidak pernah menjalankan langkah ini.

### Gateway restricted dan secret custody

`node scripts/prepare-staging-sql.mjs <APPROVED_PROJECT_REF>` hanya menghasilkan `.tmp/staging-package/gateways.sql` dan manifest checksum source. Tidak membaca env, membuka koneksi, atau mengeksekusi SQL. Review artifact ini sebagai satu transaksi dengan `ON_ERROR_STOP=1`. Generator memakai gateway Sprint 1–3, audience terikat ref staging, wrapper `extensions.pgcrypto`, dan role restricted. Tidak memasang gateway lifecycle/chat atau role Flutter.

Sebelum eksekusi yang disetujui, operator memverifikasi hostname/ref pada koneksi, kemudian menyetel session `wellbeing.approved_staging_ref` ke ref tersebut. Guard SQL merupakan konfirmasi operator, **bukan pembuktian hostname remote**. Guard juga menolak schema chatbot, gateway existing, dan ledger selain delapan migration selesai. Artifact first-time ini tidak idempotent; jangan mengulang pada instalasi parsial tanpa review. Satu transaksi mencegah sebagian gateway terpasang ketika statement gagal.

Role `website_runtime` dan `wb_pdf_worker` dibuat NOLOGIN. Setelah review grants/RLS, operator menetapkan password acak yang berbeda dan LOGIN untuk kedua role melalui sesi privat. Jangan memberikan membership role lain, ownership tabel, SUPERUSER atau BYPASSRLS. Bootstrap aplikasi/worker memeriksa atribut tersebut sebelum menerima request. Jika owner operator tidak dapat SET ROLE/mengubah ownership fungsi security-definer, hentikan setup; jangan melemahkan guard untuk melewatinya.

Bundle membuat **dua key acak baru di staging**, bukan key fixture:

- `wb_guard.signing_key.secret`: hanya dipindahkan melalui kanal privat ke secret `WELLBEING_IDENTITY_SIGNING_KEY` pada signer (hex 64 karakter). Website dan worker tidak memilikinya.
- `wb_pdf.keys` dengan kid `staging-v1`: hanya dipindahkan ke `WELLBEING_PDF_SIGNING_KEY` pada worker. Signer dan website tidak memilikinya.

Jangan menaruh output key pada log SQL/CI, screenshot atau repo. Transfer dan rotasi memerlukan custodian yang disetujui. `WELLBEING_SIGNER_TOKEN` dan `WELLBEING_PDF_WORKER_TOKEN` adalah dua bearer token acak terpisah, masing-masing hex 64 karakter; buat baru, bukan mengambil fixture lokal. Token transport tidak menggantikan verifikasi pengguna atau otorisasi job/ticket database.

### Storage

Di **Storage → New bucket**, setelah persetujuan, buat `assessment-reports`, **Public OFF**, MIME `application/pdf`, batas 5 MiB. Jangan menambahkan policy download anon/authenticated. Website mengunduh melalui endpoint aplikasi, job/ticket gateway dan recheck ownership/consent setelah I/O. Worker memeriksa bucket private saat startup, upload create-only, read-back hash/size, kemudian finalisasi metadata di DB. Secret key Storage memiliki privilege tinggi pada staging; hanya worker terpisah yang menyimpannya. Jangan memakai key proyek bersama atau memasukkannya ke Vercel website.

### Akun dan konten demo

Setelah baseline, buat akun sintetis terkonfirmasi dengan metadata sesuai `docs/AUTH-MIGRATION.md` melalui jalur Auth yang disetujui. Role psychologist diberikan operator sesuai kebijakan; jangan mengandalkan user metadata untuk eskalasi role. Publikasi periode, question set serta profil/jadwal demo memerlukan persetujuan data sintetis khusus staging. Gunakan format/fixtures Sprint 1–3 tanpa memanggil launcher lokal atau menyalin akun/data shared. Belum ada seed otomatis pada paket ini. Tanpa question set yang disetujui, asesmen akan tetap unavailable secara benar.

## Layanan signer dan PDF worker

Build offline: `node scripts/build-staging-services.mjs` setelah `npm ci` dan `npm exec -- prisma generate`. Jalankan sebagai proses terpisah setelah deployment disetujui:

- `node build/staging/signer.cjs`
- `node build/staging/pdf-worker.cjs`

Distribusikan bundle, production dependencies termasuk Prisma Client/engine hasil generate untuk OS target, serta `public/fonts/` untuk renderer PDF. Working directory adalah root artifact. Bundler menggunakan esbuild existing dari lockfile saat build, bukan package baru. Jangan mengunggah `.env` atau fixture `.tmp`.

Keduanya bind `127.0.0.1`, default port 8081/8082. Penyedia harus menyediakan reverse proxy HTTPS dalam network namespace yang dapat menjangkau loopback tersebut (misalnya VM/service dengan proxy lokal). Container platform yang hanya merutekan ke `0.0.0.0` tidak langsung kompatibel; pilih target/topologi terlebih dahulu. Batasi body/rate/timeouts di ingress; jangan log Authorization, access token atau body signing. Tidak ada public health response berisi data/credential. Jangan jadikan localhost endpoint Vercel.

Signer menghubungi Supabase Auth `getUser(accessToken)` pada ref staging yang dipatok, memeriksa confirmed user/sub/audience/purpose/expiry, lalu menandatangani pid + transaction ID. DAL juga memverifikasi token yang sama; role aktif tetap ditentukan DB. Worker memakai issuer staging berbeda, credential DB `wb_pdf_worker`, dan hanya dapat meminta input job/ticket serta finalize lewat gateway existing.

## Environment per proses (tanpa nilai)

| Nama | Website Preview | Signer | PDF worker |
| --- | --- | --- | --- |
| `WELLBEING_RUNTIME=staging` | Ya | Ya | Ya |
| `WELLBEING_STAGING_PROJECT_REF` | Ya | Ya | Ya |
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | Ya | Ya |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ya | Ya | Tidak diperlukan |
| `SITE_URL` | Origin preview stabil | Tidak | Tidak |
| `DATABASE_URL` | Role website_runtime | Tidak | Tidak |
| `WELLBEING_WORKER_DATABASE_URL` | Tidak | Tidak | Role wb_pdf_worker |
| `WELLBEING_SIGNER_URL`, `WELLBEING_SIGNER_TOKEN` | Ya | Token saja | Tidak |
| `WELLBEING_IDENTITY_SIGNING_KEY` | **Tidak** | Ya | **Tidak** |
| `WELLBEING_PDF_WORKER_URL`, `WELLBEING_PDF_WORKER_TOKEN` | Ya | Tidak | Token saja |
| `WELLBEING_PDF_SIGNING_KEY`, `SUPABASE_SECRET_KEY` | **Tidak** | **Tidak** | Ya |
| `PORT` | Dikelola Vercel | Opsional 8081 | Opsional 8082 |

Runtime URLs harus `postgresql`, database `postgres`, role tepat, `sslmode=require&sslaccept=strict`. Host direct `db.<ref>.supabase.co`, username role; atau shared pooler hostname dari Dashboard, username `<role>.<ref>`. Session pooler 5432 direkomendasikan untuk initial staging dengan `connection_limit=1`; hindari perubahan prepared-statement/transaction pooling tanpa validasi. `DIRECT_URL` hanya untuk operator migration, bukan fallback runtime. Jangan set `WELLBEING_LOCAL_RUNTIME_FILE` pada hosted. Runtime menolak `VERCEL_ENV=production`.

## Dashboard Vercel

1. Hubungkan GitHub repository `riehand/Bambu-Satu` ke team/project yang disetujui. Root `.`, framework Next.js, Node 22, build `npm run build:vercel`. Import dapat memicu deployment pertama: jangan menekan Deploy sebelum instruksi eksplisit.
2. **Settings → Git / Environments**: production branch tetap `main`. Target manual deployment adalah `riehand_branch` dengan environment **Preview**, bukan production. `vercel.json` tetap mematikan auto-deploy Git.
3. **Settings → Environment Variables**: pasang kolom Website pada **Preview**, scope branch `riehand_branch` jika tersedia. Jangan menyalin env developer. Project ref dan public key harus sudah benar ketika build karena Next.js meng-inline public env.
4. Tentukan alias HTTPS stabil; `SITE_URL` persis origin itu. **Supabase → Authentication → URL Configuration**: Site URL origin preview dan Redirect URLs `https://<alias>/auth/confirm`. Domain deployment acak lain tidak otomatis diterima oleh exact-origin CSRF. Pasang Deployment Protection untuk demo privat bila tersedia.
5. Setelah signer, worker, SQL, akun dan konten demo siap serta tindakan deploy disetujui, deploy commit yang ditinjau sebagai Preview. Verifikasi Auth → dashboard → start/save/reload/submit → hasil resmi → PDF → booking → consent/revoke, plus denial lintas akun. Itu merupakan acceptance hosted pertama; hasil tes mock tidak menggantikannya.

## Bukti dan batas saat ini

- Tes terarah: 60 PASS (staging config/signer/request 9, DAL 6, standard runtime 13, Auth 32); tidak mengulang UI regression.
- TypeScript, lint, build Next.js/Prisma (`npm run build:vercel`) dan bundle signer/worker: PASS. Build memakai override proses loopback sintetis, bukan credential hosted.
- Generator dijalankan offline dengan ref sintetis untuk memeriksa hasil adaptasi; tidak diterapkan ke database.
- Docker Desktop Linux engine tidak tersedia pada sesi implementasi, sehingga eksekusi SQL baru terhadap PostgreSQL belum diverifikasi. Target Supabase/Vercel/worker belum diberikan. Tidak ada klaim gateway hosted siap operasi atau URL demo berhasil.
- Registrasi baru masih bergantung preflight institutional ID yang existing dan belum mempunyai gateway anonymous. Untuk demo awal gunakan akun Auth sintetis yang diprovision operator; jangan membuka SELECT users kepada anon.
- Admin mutations/aktivasi institusi, chat/lifecycle dan konten asesmen produksi tetap tidak diaktifkan.

Referensi: [Supabase custom-role connection](https://supabase.com/docs/guides/database/connecting-to-postgres), [verified Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls), [Vercel Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration).
