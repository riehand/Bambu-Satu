# Phase 3 — Stage 3D: Next.js Security Patch & Full Regression

Tanggal pemeriksaan: 21 November 2026. Repository `riehand/Bambu-Satu`, branch `riehand_branch`, HEAD awal `b15b274`. Scope hanya patch dependency keamanan dan regresi; tidak ada fitur bisnis baru.

**Status: warning versi Next.js rentan dan SecurityFatalError yang dilaporkan sebelumnya terselesaikan pada clean build lokal 16.4.6.** Regresi unit/API/browser lulus. Audit seluruh dependency tetap memiliki advisory development; detail pada I.

## A. Versi dependency awal

| Paket/tool | Deklarasi awal | Terpasang awal |
| --- | --- | --- |
| next | dependencies: 16.4.2 | 16.4.2 |
| eslint-config-next | devDependencies: 16.4.2 | 16.4.2 |
| react / react-dom | dependencies: 19.3.0 | 19.3.0 / 19.3.0 |
| prisma | devDependencies: ^5.22.0 | 5.22.0 |
| @prisma/client | dependencies: ^5.22.0 | 5.22.0 |
| @supabase/ssr | dependencies: ^0.12.7 | 0.12.7 |
| @supabase/supabase-js | dependencies: ^2.118.0 | 2.118.0 |
| next-auth | dependencies: ^4.24.15 | 4.24.15 |
| TypeScript / ESLint | devDependencies: ^5 / ^9 | 5.9.3 / 9.39.5 |
| Node.js / npm | toolchain lokal | 22.17.0 / 11.18.0 |

@next/env, @next/eslint-plugin-next dan SWC Windows x64 awalnya 16.4.2. Klasifikasi dependency mengacu pada entry root package.json/package-lock, bukan semata flag dev pada node transitif yang dapat juga menjadi peer dependency runtime.

Sebelum perubahan, 45 berkas pekerjaan Stage 2B.3/3A/3C masih modified/untracked. Inventaris status dan SHA-256 disimpan di `.tmp/stage3d/initial-status.txt` dan `initial-worktree.json`. Delapan hash migration SQL ada di `migrations-before.json`; salinan manifest/lockfile awal juga disimpan di direktori evidence tersebut. Tidak dilakukan reset/clean/staging.

## B. Advisory resmi yang diverifikasi

[Rilis 16.4.5](https://github.com/vercel/next.js/releases/tag/v16.4.5) tanggal 3 November 2026 memuat tujuh perbaikan berikut. Rentang tabel khusus cabang 16.x; beberapa advisory juga mencakup cabang 15.x.

| Advisory | Versi 16.x terdampak | Patch | Relevansi audit aplikasi |
| --- | --- | --- | --- |
| [GHSA-rhh4-g77r-r9qj](https://github.com/vercel/next.js/security/advisories/GHSA-rhh4-g77r-r9qj) | 16.0.0–16.4.4 | 16.4.5 | Cache binary arguments; tidak ditemukan penggunaan langsung use cache |
| [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) | 16.3.0–16.4.4 | 16.4.5 | Race root params melalui unstable_cache; pola tersebut tidak ditemukan |
| [GHSA-vc7v-qv4w-wrv8](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8) | 16.2.0–16.4.4 | 16.4.5 | Nested use cache dan metadata stream terlambat; pola tidak ditemukan |
| [GHSA-vvgp-ww4w-46vf](https://github.com/vercel/next.js/security/advisories/GHSA-vvgp-ww4w-46vf) | 16.4.0–16.4.4 | 16.4.5 | Shared fallback shell; konfigurasi proyek partialPrefetching=true berbeda dari prasyarat advisory |
| [GHSA-pc58-hwjq-p385](https://github.com/vercel/next.js/security/advisories/GHSA-pc58-hwjq-p385) | 16.0.0–16.4.4 | 16.4.5 | Framing respons upstream pada self-hosted proxy; PDF membangun response bytes/header sendiri |
| [GHSA-7qx7-33qx-rqx2](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2) | 16.0.0–16.4.4 | 16.4.5 | Bypass penolakan SVG pada image optimizer; tidak ada remotePatterns/dangerouslyAllowSVG khusus |
| [GHSA-f3mh-rxg3-f5g2](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2) | 16.0.0–16.4.4 | 16.4.5 | Internal header membocorkan cookie HttpOnly pada route Edge; tidak ditemukan deklarasi runtime Edge |

Seluruh tujuh advisory berseverity Moderate. Versi terpasang 16.4.2 termasuk rentang terdampak; itu bukan bukti aplikasi telah dieksploitasi. Temuan pola source merupakan pemeriksaan terbatas, bukan bukti ketidakmungkinan eksploitasi.

[Rilis stabil 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6), 9 November 2026, melanjutkan patch dengan perbaikan kompresi route handler dan Turbopack. Registry npm resmi mengonfirmasi next dan eslint-config-next 16.4.6 tersedia. Engine Next >=20.9.0 dan peer React ^19.0.0 kompatibel dengan Node 22.17.0/React 19.3.0 saat ini.

## C. Paket yang diperbarui dan versi akhir

Berhasil: next **16.4.6** pada dependencies dan eslint-config-next **16.4.6** pada devDependencies. @next/env, @next/eslint-plugin-next dan seluruh delapan varian @next/swc di lockfile berubah 16.4.2 → 16.4.6. Paket native yang terpasang pada mesin ini adalah @next/swc-win32-x64-msvc 16.4.6. `npm ls ... --depth=1` exit 0 tanpa invalid peer, dengan React/React DOM 19.3.0 dan Prisma/client 5.22.0 tetap sama.

## D. Diff package/lockfile

Manifest hanya mengubah dua pin 16.4.2 → 16.4.6. Instalasi menggunakan `npm.cmd install --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org` setelah edit presisi kedua field. Audit dijalankan terpisah; tidak ada npm audit fix/force atau upgrade major.

Perbandingan terstruktur lockfile menunjukkan 12 entry paket keluarga Next berubah, ditambah entry root untuk dua deklarasi tersebut. Tidak ada paket ditambah/dihapus atau entry paket di luar keluarga Next berubah. package-lock.json +48/-48, package.json +2/-2; total +50/-50. URL resolved tetap registry npm resmi, tanpa dependency file lokal atau override baru. Evidence: `.tmp/stage3d/lock-changes.json`.

Dua percobaan awal npm gagal dengan ECONNRESET saat unduhan next/SWC, disertai warning cleanup EPERM Windows. Unduhan resmi menggunakan curl berhasil: next 43.665.499 bytes dan SWC Windows x64 36.161.220 bytes. SHA-512 kedua tarball cocok dengan dist.integrity registry sebelum `npm cache add`; instalasi identik dengan prefer-offline kemudian berhasil, exit 0, lima paket terpasang berubah. Tidak menonaktifkan SSL/integrity, mengganti registry, atau memakai kode dari sumber alternatif.

- Next: `sha512-QZJiYhaZLJMo2KpkQGQIwvmd79WVsAWeYIU554a8d7zArS3si/IRy3lBNV/rtYhE70oLwdLYhPAXLPx8HwcwtA==`
- SWC Windows x64: `sha512-3ZG15/5WIdlTQsIEvc9sPTTSL5XFrlLklIKmfF4fwsDnoAhu6NcBDXsk3mbGxNyo6aVLEGex+fHCv2MahY7a9g==`

## E. Perubahan kompatibilitas

Panduan lokal Next.js Upgrading serta Authentication with Cache Components dibaca sebelum perubahan. Target tetap Next.js 16; React/Prisma tidak diturunkan. Tidak diperlukan perubahan source aplikasi, konfigurasi, schema atau assertions tes untuk kompatibilitas. next.config.ts, tsconfig.json, auth/session, PDF, lifecycle/chat dan admin tetap sama.

## F. Regresi autentikasi, cache dan keamanan

- Supabase server client membaca cookies async dan meneruskan opsi cookie SDK; proxy mempertahankan cookie refresh dan private/no-store ketika redirect. Otorisasi backend memakai getUser terverifikasi dan profil/role aktif database, bukan metadata role client.
- Halaman participant, psychologist dan admin menggunakan requirePageRole. Request-dependent cookie/profile read tetap di sisi server; tidak dimasukkan ke shared cache.
- cacheComponents=true dan partialPrefetching=true dipertahankan. Pencarian source tidak menemukan use cache, unstable_cache, force-static, force-cache, generateStaticParams, atau deklarasi runtime Edge. Tidak mengubah setting untuk menyembunyikan warning.
- API asesmen, booking/consent, PDF, lifecycle, Human Chat dan admin memakai private/no-store pada sukses/error melalui helper atau header eksplisit. Origin untuk mutasi dan pembatasan trusted role dipertahankan.
- PDF memeriksa actor/ownership/consent, memvalidasi artifact, lalu memeriksa ulang akses sebelum response ArrayBuffer dengan application/pdf, attachment, nosniff dan no-store. Tidak meneruskan header/framing respons upstream mentah.
- Prisma dan report storage tetap server-only. Key Supabase istimewa tidak berubah menjadi NEXT_PUBLIC. SUPERADMIN tidak memperoleh akses PDF/chat/hasil individual.
- Tidak ada pengaktifan Human Chat production, aksi lifecycle yang masih diblokir, clinical indicators, perubahan kuota atau kebijakan institusi.

## G. Hasil unit/API/browser aktual

Perintah regresi dijalankan berurutan; browser selesai sebelum build dimulai. Tidak ada tes dinonaktifkan, assertion dikurangi, atau fixture bisnis diubah.

| Pemeriksaan | Hasil aktual Stage 3D |
| --- | --- |
| `npm.cmd test` | PASS 547/547, 33 file, 14,83 detik |
| `npm.cmd run test:browser -- --reporter=list` | PASS 120/120, 1,4 menit |
| `npm.cmd exec -- tsc --noEmit` | PASS exit 0 |
| `npm.cmd run lint` | PASS exit 0, nol error; dua warning no-img-element lama di src/app/page.tsx:54 dan :160 |
| `npx.cmd prisma validate` | PASS exit 0 dengan URL PostgreSQL localhost sintetis; tanpa koneksi DB |
| `npm.cmd run build` | Hasil dibahas pada H |
| `git diff --check` | PASS exit 0; whitespace laporan baru juga diperiksa |

Regresi mencakup signup/login/logout/konfirmasi, cookie refresh dan redirect proxy, role/inactive/forged identity denial, asesmen, booking/consent, PDF authorization dan download, availability stale data, lifecycle, Human Chat, Super Admin dan no-store. Tes unit memakai mock atau database sintetis PGlite; browser memakai harness Vite lokal dengan API intercepted, bukan session hosted.

Warning stdout NO_COLOR/FORCE_COLOR di runner browser bersifat formatting terminal. Output tes negatif auth/PDF tetap muncul seperti baseline dan tes terkait lulus; tidak ditutupi agar terlihat bersih.

## H. Hasil clean production build

**PASS pada percobaan clean build pertama setelah upgrade**, exit 0. Next.js 16.4.6, compile 21,4 detik, TypeScript build 10,9 detik, 38 halaman dihasilkan. Tidak ada SecurityFatalError atau warning keamanan versi Next.js. Tidak diperlukan retry build atau perubahan security setting. Dua warning image ESLint pada G adalah warning performa existing yang terpisah dari advisory keamanan.

Output .next lama dipindahkan ke `.tmp/stage3d/next-before` setelah path sumber/tujuan dipastikan di workspace; tidak dihapus. Build baru tidak memakai cache/output itu. Browser sudah berhenti sebelum pemindahan/build. Semua alamat DB/Supabase pada environment proses memakai localhost dan credential sintetis, tanpa edit file environment. Log lengkap: `.tmp/stage3d/build.log`.

Semua route API tetap dinamis pada output build; prerender manifest tidak memiliki route `/api/*`. Halaman participant/psychologist/admin tetap partial prerender dengan konten server bergantung request, bukan data pribadi statis. Pemindaian 35 aset client di `.next/static` tidak menemukan dua marker credential server-only sintetis yang diberikan saat build. Ini verifikasi marker khusus, bukan pemindaian seluruh jenis secret.

Smoke production lokal `node .tmp/stage3d/smoke.mjs`: **17/17 pemeriksaan HTTP lulus**. Login/register dapat dibuka; tiga dashboard role mengarahkan anonim ke login; sepuluh API privat menolak anonim dengan 401 dan no-store; login/logout menolak Origin asing dengan 403. Respons yang diperiksa tidak mengekspos x-middleware-set-cookie. Server hanya bind loopback, memakai konfigurasi sintetis, lalu dihentikan. Evidence: smoke-result.json, smoke-server.log dan smoke.mjs dalam direktori evidence.

Percobaan smoke pertama gagal di parser skrip yang mengasumsikan header Location absolut; server memberikan redirect relatif `/auth/login` yang valid. Parser menggunakan base origin lalu seluruh pemeriksaan diulang dan lulus. Status redirect, lokasi login, dan assertion keamanan tidak dilonggarkan; tidak ada perubahan kode aplikasi. Smoke anonim tidak mengklaim telah menguji cookie session hosted yang valid atau semua skenario eksploitasi advisory.

## I. Audit dependency dan advisory tersisa

`npm audit` awal: 11 entry dependency terdampak (9 moderate, 2 critical). Sesudah patch: **10 entry (8 moderate, 2 critical), exit 1**, tanpa entry next. Angka npm menghitung paket transitif/metavulnerability, bukan sepuluh advisory unik. Tujuh advisory next pada bagian B tidak lagi muncul. Tidak ada perbaikan otomatis terhadap paket di luar scope.

| Rantai yang tetap terdampak | Versi terpasang | Advisory dan status |
| --- | --- | --- |
| Vitest → Tinypool | 3.2.7 → 1.1.1 | Critical: [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), worker options prototype-pollution gadget; patch Tinypool 2.1.1. [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), run options gadget; patch 2.1.2. Keduanya tetap belum diperbaiki |
| Vitest / @vitest/mocker | 3.2.7 | Moderate: [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), redirect mock path traversal; patch cabang stabil 4.1.11. [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), manual mock injection; patch 4.1.12/5.0.3 |
| typescript-eslint → minimatch | typescript-estree 8.72.0; nested minimatch 10.2.6 | Moderate: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), amplifikasi glob; patch minimatch 11.0.1. Tercermin pada enam entry typescript-eslint/parser/plugin/utils dan satu minimatch |

Semua entry tersisa berflag dev pada lockfile. Ini tidak membuat risikonya nol: tooling tetap berjalan di mesin developer/CI. Advisory Tinypool membutuhkan primitive prototype pollution; laporan tidak mengklaim primitive tersebut ditemukan di aplikasi. Audit menyarankan upgrade major Vitest 5.1.1 untuk rantai terkait; tidak diterapkan secara otomatis dalam tahap Next.js ini. Evaluasi kompatibilitas dan remediasi tooling merupakan tindak lanjut terpisah yang diprioritaskan.

`npm audit --omit=dev` **exit 0, nol advisory** pada graph production saat pemeriksaan. Ini hasil database advisory yang diketahui, bukan jaminan tidak ada vulnerability lain. Evidence: `.tmp/stage3d/audit-before.json`, `audit-before-utf8.json`, `audit-after.json`, `audit-production.json`. Audit awal berhasil menghasilkan JSON tetapi helper Node gagal membaca encoding UTF-16 output PowerShell; JSON dibaca ulang melalui PowerShell dan salinan UTF-8 disimpan. Ini bukan kegagalan endpoint audit atau hasil nol vulnerability.

## J. Batas bukti dan masalah keamanan yang belum terselesaikan

Patch framework bukan sertifikasi seluruh aplikasi aman. Hosted Supabase, kredensial nyata, data peserta, deployment, proxy production, valid session hosted, dan eksploitasi multi-tenant production tidak diuji. Browser regresi memakai harness lokal/API sintetis; pemeriksaan auth unit memakai mock Supabase dengan guard sebenarnya.

Database code/schema tidak berubah sehingga rehearsal Docker yang menjalankan migrasi tidak perlu diulang pada tahap patch framework ini. Angka 43 tes PostgreSQL/33 SQL checks adalah baseline Stage 3C, bukan hasil baru Stage 3D. Delapan migration SQL diperiksa hash tanpa mengeksekusi migrasi atau mengubah privilege/objek Auth/Flutter. Tes database sintetis yang merupakan bagian suite npm test tetap dijalankan sesuai perintah regresi.

Kebijakan privasi/lifecycle/provisioning, least-privilege runtime/deployer, redaksi log, rate limits, capacity, backup/restore hosted serta migrasi tertunda dari tahap sebelumnya tetap memerlukan workstream terpisah.

## K. Berkas yang berubah

Tepat tiga berkas deliverable berubah pada Stage 3D:

1. `package.json`: dua pin framework.
2. `package-lock.json`: versi, integrity/resolved dan referensi versi keluarga Next.js yang cocok.
3. `docs/PHASE3-STAGE3D-NEXTJS-SECURITY.md`: laporan ini.

Tidak ada source aplikasi, konfigurasi keamanan, tes existing, Prisma schema/migration, objek Auth/Flutter, secret atau kebijakan bisnis yang berubah. Seluruh **45 hash berkas awal cocok**, dan **delapan migration SQL cocok**. Evidence preservation-result.json dan status akhir disimpan di `.tmp/stage3d/`; evidence tersebut tidak distaging.

## L. Git akhir dan langkah berikutnya

Branch tetap riehand_branch dan HEAD tetap b15b274. Seluruh worktree memiliki **48 berkas modified/untracked**, terdiri dari 45 berkas awal yang dipertahankan dan tiga deliverable tahap ini. Stat tracked seluruh worktree: delapan berkas, +90/-54, mencakup pekerjaan lama. Kontribusi dependency Stage 3D sendiri: dua berkas tracked +50/-50, ditambah laporan baru. Tidak ada staging, commit, push, merge atau deploy.

Prioritas berikutnya adalah remediasi terpisah tooling Vitest/Tinypool dan rantai lint/minimatch, dengan review kompatibilitas serta regresi, tanpa auto-fix major secara buta. Lanjutkan juga blocker operasional/database dan persetujuan institusi dari Stage 3C; patch ini tidak mengaktifkan fitur yang menunggu kebijakan atau mengotorisasi rollout hosted. Implementasi, verifikasi dan dokumentasi Stage 3D berhenti di sini.
