# Menjalankan environment pengujian manual lokal

Gunakan **http://127.0.0.1:55430/auth/login** untuk stack Phase 4 Sprint 1–3. Gunakan hostname ini secara konsisten untuk session cookie dan pemeriksaan origin.

Stack ini khusus pengujian sintetis. Pengembangan standar menggunakan `npm run dev` di **http://localhost:3000** dengan proyek Supabase terkonfigurasi, bukan akun GoTrue lokal. Lihat [konsolidasi environment](DEVELOPMENT-ENVIRONMENT-CONSOLIDATION.md) untuk batas kompatibilitas hosted. Kedua server menggunakan source yang sama dan output compiler terpisah (`.next` / `.next-isolated`).

## Penyebab dan pemulihan

Saat pemeriksaan, Next.js Sprint pada port 55430 sudah tidak berjalan. Next.js lain milik repository berjalan di port 3000 dengan binding `::` (semua antarmuka), URL database/Auth non-loopback, tanpa `WELLBEING_LOCAL_RUNTIME_FILE`, dan tanpa endpoint PDF worker. Ini berbeda dari bootstrap Sprint yang memasang restricted DAL. Pesan layanan asesmen tidak tersedia berasal dari jalur yang tidak memakai konfigurasi Sprint tersebut; tidak dilakukan koneksi diagnostik ke endpoint nonlokal untuk menyelidikinya.

Empat container Sprint masih sehat dan worker masih aktif. Proses Next port 3000 dihentikan setelah identitas proses proyek diperiksa. Website dan worker dijalankan ulang memakai konfigurasi lokal existing dan environment allowlist. Worker sebelumnya sudah menggunakan datasource eksplisit lokal, tetapi variabel DATABASE_URL/DIRECT_URL yang tidak dipakainya terisi dari environment file; launcher baru juga mengoverride keduanya dengan role worker lokal agar tidak ada ambiguitas.

Tidak ada reset database/volume, seed ulang, perubahan secret, perubahan schema/migration, upgrade package, atau perubahan kode aplikasi. Prisma tetap 5.22. Data Sprint sebelumnya tetap ada.

## Perintah

Jalankan dari root repository menggunakan PowerShell, dengan Docker Desktop aktif dan dependensi existing terpasang:

```powershell
python scripts/local-manual.py start
python scripts/local-manual.py status
```

`start` memvalidasi Docker context lokal, label/network/port container, role dan endpoint konfigurasi, kecocokan key dengan Storage lokal, marker database, serta bucket privat. Container yang berhenti dijalankan kembali menggunakan volume existing; tidak membuat container atau menerapkan SQL. Proses website/worker dijalankan tersembunyi dan tetap hidup setelah perintah selesai. Pemanggilan ulang mempertahankan proses yang sudah dikelola. Tunggu keluaran `Ready` sebelum membuka browser.

Untuk menghentikan website dan worker saja:

```powershell
python scripts/local-manual.py stop
```

Untuk sekaligus menghentikan **empat container Sprint ini saja**, tanpa menghapus container, volume, atau data:

```powershell
python scripts/local-manual.py stop-all
```

Jalankan `start` untuk melanjutkan. `stop` memeriksa PID, waktu pembuatan, dan command proses yang dicatat launcher sebelum menghentikan pohon proses; tidak membunuh semua proses Node. Siklus `stop` → `start` website/worker telah diuji pada pemulihan ini. `stop-all` tidak dijalankan saat pemulihan karena container masih sehat.

`npm run dev` adalah workflow development standar dan tidak memasang bootstrap sintetis; launcher di atas tetap khusus acceptance lokal. Jangan menjalankan bootstrap provisioning/reset, migration, atau Supabase CLI start sebagai pengganti launcher. Bila port dimiliki proses yang tidak dikelola launcher, launcher berhenti agar proses tersebut diperiksa terlebih dahulu.

## Endpoint dan akun

| Layanan | Endpoint / identitas |
| --- | --- |
| Website | `http://127.0.0.1:55430`, role `website_runtime` |
| Dashboard | `http://127.0.0.1:55430/participant/dashboard` |
| Asesmen | `http://127.0.0.1:55430/participant/assessment` |
| Riwayat | `http://127.0.0.1:55430/participant/history` |
| PDF worker | `127.0.0.1:55440`, role `wb_pdf_worker`; bukan halaman untuk browser pengguna |
| Auth/Storage gateway | `127.0.0.1:50243` |
| PostgreSQL | `127.0.0.1:50244`, database `wellbeing_phase3_rehearsal` |

Semua port host tersebut bind `127.0.0.1`. Auth dan Storage tidak mempunyai port host sendiri; koneksi antar-container menggunakan network privat `wb-sprint1-loopback`. Container existing: `wb-sprint1-db`, `wb-sprint1-auth-real`, `wb-sprint1-storage`, dan `wb-sprint1-kong`. Container lain tidak disentuh.

Akun participant sintetis existing ada dalam `.tmp/phase4-sprint1/browser-local.json`, bagian `users[0]` dan `users[1]`. Buka berkas itu secara lokal untuk mengambil email/password; nilainya tidak disalin ke dokumentasi atau chat. Akun psikolog ada dalam `.tmp/phase4-sprint3/browser-local.json`. Jangan memakai akun hosted untuk pengujian ini.

Konfigurasi yang dipakai kembali:

- `.tmp/phase4-sprint1/runtime-local.json`: restricted DAL lokal.
- `.tmp/phase4-sprint1/browser-local.json`: key Auth lokal dan akun sintetis.
- `.tmp/phase4-sprint2/worker-local.json`: database worker, Storage lokal, dan key worker.
- `.tmp/phase4-sprint2/website-worker-local.json`: endpoint/token worker untuk website.

Berkas tersebut tetap diabaikan Git. Website tidak menerima credential Storage service-role atau signing key worker. Pemeriksaan environment efektif proses baru membuktikan DATABASE_URL/DIRECT_URL lokal dengan role masing-masing, Auth lokal, dan endpoint worker lokal. Bootstrap DAL dan worker memverifikasi role non-superuser/non-BYPASSRLS saat startup; tidak ada privileged fallback. Label `.env` pada log Next tidak mengubah override koneksi proses yang telah diperiksa.

GoTrue existing masih mempunyai default site URL loopback port 3000 untuk sebagian alur email. Login password akun sintetis di port 55430 berhasil; signup/reset-password via email tidak termasuk acceptance pemulihan ini. Tidak dilakukan recreate container untuk mengubah konfigurasi email tersebut.

## Bukti verifikasi

Browser Chrome nyata dengan GoTrue lokal, tanpa mock API, membuktikan:

- Login participant HTTP 200 dan dashboard dengan profil/kuota sintetis.
- Halaman asesmen dapat dimuat; start melalui consent dan tombol UI menghasilkan HTTP 201.
- Sesi `e222a4b5-12a7-4451-9526-7dc27dae3902` tersimpan IN_PROGRESS, satu jawaban, revision 1; tetap dapat dilanjutkan setelah reload. Draft ini sengaja dipertahankan untuk pengujian manual.
- Halaman dan API riwayat dapat dibuka, HTTP 200.
- Download report nyata Sprint 3 melalui aplikasi HTTP 200, berisi PDF; membuktikan jalur worker/Storage tetap berfungsi.
- Tidak ada permintaan browser ke host nonlokal.

Pemeriksaan awal skrip browser berhenti karena judul riwayat yang diharapkan tidak sesuai UI dan kemudian karena navigasi resume belum ditunggu. Assertion disesuaikan dengan judul existing dan URL sesi ditunggu; tidak ada perbaikan aplikasi atau penghapusan data untuk meluluskan pemeriksaan.

Bukti tanpa secret: `.tmp/local-recovery/browser-first-attempt.json` (start 201), `browser-evidence.json` (resume/history/PDF), `process-environment-before.json`, `process-environment.json`, dan screenshot dashboard/assessment/history. Log proses baru: `.tmp/local-manual/website.log` dan `worker.log`; catatan PID: `.tmp/local-manual/processes.json`.

Pemulihan ini mengubah hanya launcher operasional dan dokumentasi; full regression aplikasi tidak diulang. Tidak ada akses hosted Supabase, commit, push, atau deploy. Environment dibiarkan aktif untuk pengujian manual.
