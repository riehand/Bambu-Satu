# Stage 3E.1E - DAL Integration

## A. Arsitektur awal
Service mengimpor singleton Prisma. Guard memakai Supabase auth.getUser + email confirmation lalu lookup profil aktif. Adapter B/D belum menjadi DAL aplikasi; nested transaction belum propagasi context. Gateway B/C/D tersedia hanya dalam rehearsal.

## B. Trust boundary sebelum perubahan service
Rantai yang diuji: Supabase getUser terverifikasi -> subject request -> signer lokal terinjeksi -> claim terikat PID/transaction ID -> pemeriksaan role/aktif database -> website_runtime -> gateway. Role/active authoritative diperiksa database setelah pemasangan claim, bukan berasal dari caller. Signer tidak menyediakan role. Implementasi signer lokal masih prototipe; proses yang menguasai HMAC dapat mengimpersonasi pengguna. Custody signer independen dan production identity integration tetap BLOCKED.

DAL hanya dapat dikonfigurasi secara programatik dalam NODE_ENV=test, dengan URL localhost, role website_runtime, marker rehearsal cocok dan pemeriksaan non-owner/non-bypass. Tidak ada flag environment untuk mengaktifkan signer produksi. Setelah mode lokal dipasang, context hilang tidak boleh fallback ke singleton lama. Jalur produksi lama dipertahankan; ini bukan aktivasi least-privilege produksi. Tidak ada hosted access, credential perubahan, commit/push/deploy.

## C. Implementasi DAL

`src/lib/dal/context.ts` memakai AsyncLocalStorage request dan transaksi, kompatibel Prisma 5.22. Proxy late-binding pada `src/lib/prisma.ts` mengarahkan delegate, raw query, dan callback transaction ke client transaksi yang sama. Import singleton yang telah di-cache tidak melewati context. Nested callback menggunakan transaksi yang sama; array transaction dan operasi administratif client ditolak pada mode ini. Runtime dibuat sendiri dari URL yang divalidasi, bukan client privileged dari caller.

Identitas dipasang memakai SET LOCAL, terikat PID/xact ID, masa berlaku 30 detik. Transaksi dibatasi 15 detik, antrean 5 detik, ReadCommitted; opsi transaksi caller tidak dapat memperpanjang masa claim. Request dibatasi 60 detik. Role/active diperiksa melalui database; caller ID/role harus cocok. Error Prisma dipetakan ke kode terbatas tanpa SQL atau data privat. Pool reconnect tetap memakai website_runtime; kegagalan signer/context tidak memilih client lama.

Wrapper HTTP assessment, appointment/consultation/chat, psychologist, dan admin memasang request context melalui auth.getUser. Jalur route, validasi payload, email confirmation, Origin dan private/no-store tetap digunakan. Page loader serta report generation/download belum mempunyai boundary terintegrasi; dalam mode lokal terpasang, query tanpa context ditolak. Mode ini tidak dapat diaktifkan pada NODE_ENV=production.

## D. Assessment

Service start/save/history memakai transaksi scoped dan RLS. Submit service memanggil `wb_guard.submit_assessment` dengan expected revision, kemudian memuat hasil melalui query milik peserta. Scoring resmi berjalan di database, completion/score/report PENDING atomik. Tes aktual menyimpan 35 jawaban, memeriksa skor, stale revision, retry idempotent, history, dan penolakan pengguna lain. Handler start/save/submit juga dijalankan dengan database nyata. Tidak ada total skor dari browser yang dipercaya.

## E. Booking dan consent

Service booking memanggil gateway atomik dan proyeksi psychologist_display. Tanggal dan jenis sesi DTO diturunkan dari waktu resmi gateway dalam Asia/Jakarta memakai konfigurasi sesi aplikasi. Participant tidak membaca tabel slot milik psikolog; tidak ada perluasan GRANT/RLS. Jika waktu tidak cocok konfigurasi, transaksi dibatalkan. Gateway tetap memverifikasi assessment terbaru, GENERATED metadata, consent afirmatif dan slot.

Standalone/appointment consent, revoke, expiry, serta database report authorization menggunakan gateway D. History/audit dipertahankan; listing consent menyelaraskan expiry dengan waktu/status database. `authorizeReportGrant` memberikan bukti consent dan audit ACCESSED saja, bukan URL atau otorisasi artifact Storage. GENERATED pada rehearsal disiapkan owner fixture sintetis; runtime ditolak saat mencoba membuat metadata GENERATED.

Daftar/detail appointment lama membutuhkan slot dan atribut pihak lain yang tidak tersedia pada proyeksi terbatas. Pada mode lokal, service tersebut mengembalikan unavailable eksplisit. Kontrak produksi lama tetap tersedia saat mode lokal tidak terpasang.

## F. Lifecycle dan Human Chat

Check-in/start/end service memakai gateway D dan proyeksi assignment_display untuk DTO. Timestamp database, kedua check-in, penutupan atomik, expiry consent dan idempotensi tetap berlaku. List consultation menggunakan data scoped serta proyeksi nama pihak lain.

Chat service memakai send/read/confirm gateways, validasi payload dan cursor lama, ordering database, serta konversi timestamp ISO. Cursor transport mempertahankan appointment/id/at; gateway memakai timestamp tersimpan dari ID, bukan mempercayai nilai at caller. Konfirmasi persistence dilakukan di transaksi baru setelah commit. Send di dalam transaksi luar ditolak karena belum dapat memberikan pengakuan postcommit yang benar; nested operasi lain menggunakan transaksi yang sama.

Badan trigger historis dan deferred protections tidak diedit. Proposal D yang telah direview memakai owner wb_chat non-table-owner/non-bypass dan search_path tetap; seluruh proposal diwariskan tanpa perubahan. Tes deferred COMMIT dan race end/send memeriksa data persisted, bukan hanya promise Prisma. Human Chat produksi dan check-in/start tanpa persetujuan institusi tetap diblokir.

## G. Super Admin

`adminRestrictedOverview` memakai aggregate gateway terbatas melalui service aktual. Tidak ada hak SELECT klinis, score/report/consent/chat tambahan. Dashboard lengkap, daftar psikolog dan appointment admin yang membutuhkan atribut tidak didukung mengembalikan ADMIN_UNAVAILABLE dalam mode lokal. Tidak ada angka nol pengganti metrik unsupported. Clinical indicators tetap false. Tidak dibuat route dashboard baru yang mengklaim kontrak lengkap.

## H. Bukti workflow dan API

PASS berarti hanya cakupan lokal sintetis yang benar-benar diuji. PARTIAL berarti ada bagian kontrak/jalur yang belum terintegrasi atau belum diuji langsung. Semua hosted/production BLOCKED; tidak ada hosted acceptance dilakukan.

| Workflow | Database | Service aktual | API aktual | Hosted/production |
| --- | --- | --- | --- | --- |
| Profil peserta/auth aktif | PASS | PASS | PASS melalui protected handlers | BLOCKED |
| Assessment start/save/submit | PASS | PASS | PASS | BLOCKED |
| Assessment history | PASS | PASS | PARTIAL: history handler belum diuji pada runtime ini | BLOCKED |
| Profil/availability psikolog | PASS | PASS | PARTIAL: wrapper terpasang, service diuji | BLOCKED |
| Booking | PASS | PASS | PASS | BLOCKED |
| Daftar/detail appointment | PARTIAL: proyeksi belum lengkap | BLOCKED pada mode lokal | BLOCKED pada mode lokal | BLOCKED |
| Consent grant/revoke | PASS | PASS | PASS untuk standalone/revoke | BLOCKED |
| Appointment consent/expiry | PASS | PASS | PARTIAL: service/lifecycle terbukti | BLOCKED |
| Report authorization database | PASS | PASS | BLOCKED untuk artifact | BLOCKED |
| Lifecycle check-in/start/end | PASS | PASS | PARTIAL: handler check-in diuji, start/end pada service | BLOCKED |
| Chat send/read | PASS | PASS | PASS | BLOCKED |
| Restricted admin aggregates | PASS | PASS | BLOCKED untuk dashboard lengkap | BLOCKED |
| PDF generation/Storage attestation | BLOCKED | BLOCKED pada runtime ini | BLOCKED pada runtime ini | BLOCKED |

Tes baru tidak memock Prisma maupun service. Supabase auth.getUser disimulasikan dengan identitas sintetis; koneksi website_runtime, transaksi, gateway, trigger dan persistence memakai PostgreSQL nyata. Karena itu bukti ini tidak mencakup verifikasi token Supabase hosted atau custody signer independen. Browser regression memakai harness sintetis yang sudah ada, bukan browser ke hosted database.

## I. Transaksi, concurrency dan isolasi

Cakupan tes meliputi caller ID/role palsu, inactive profile, context hilang, signer gagal, token transaksi lama, global imported client, nested callback, rollback booking, concurrent booking, concurrent lifecycle, chat send versus end, deferred rollback, pool dua koneksi dengan 12 request, reconnect, serta penolakan SET ROLE/Flutter/ledger/GENERATED mutation. Semua delapan migration hash dibandingkan; snapshot katalog Flutter dari harness lama tetap diuji.

Rehearsal awal gagal karena institutional_id fixture terlalu pendek; fixture diperbaiki tanpa mengubah shared Auth trigger. Dua rehearsal berikutnya menunjukkan bahwa membaca slot sebelum maupun sesudah booking tidak diizinkan oleh RLS peserta. Perbaikan menggunakan waktu gateway sebagai sumber DTO; tidak mengubah policy untuk membuat tes lulus. Evidence kegagalan tetap disimpan pada direktori rehearsal 2026-11-23T16-43, 16-45, dan 16-48.

## J. Hasil regresi lengkap

Validasi 24 November 2026 (Asia/Jakarta), dijalankan berurutan dengan environment sintetis localhost pada process scope saja:

| Perintah | Hasil aktual |
| --- | --- |
| `npm.cmd test` | PASS: 551 tes, 34 file |
| `npm.cmd run test:browser -- --reporter=list` | PASS: 120 tes |
| `npm.cmd exec -- tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run lint` | PASS: 0 error; 2 warning lama no-img-element pada src/app/page.tsx |
| `npx.cmd prisma validate` | PASS |
| `npm.cmd run build` | PASS, Next.js 16.4.6 |
| `git diff --check` | PASS |

Bukti command lengkap: `.tmp/stage3e1e/validation-results.json` dan unit/browser/tsc/lint/prisma/build/diff.log. Snapshot 30 file SQL/migrasi sebelum tahap ini dibandingkan kembali: 30 identik, 0 berubah (`preservation-result.json`).

Percobaan rehearsal 24 November pukul 11:09 WIB gagal sebelum database dibuat karena Docker Desktop Linux engine tidak berjalan (`.tmp/phase3-rehearsal-2026-11-24T04-09-03.744Z/execution.log`). Engine lokal kemudian dinyalakan untuk mencoba kembali. Kegagalan infrastruktur tersebut tidak dihitung sebagai test pass.

Rehearsal final **PASS lokal sintetis**, selesai 24 November 2026 pukul 11:12 WIB. PostgreSQL 17.11 dan Prisma 5.22.0: 22 tes E baru + 25 D + 14 C + 17 B + 16 E1 + 43 terdahulu = **137 tes PostgreSQL**, ditambah 33 assertion SQL harness terdahulu. Seluruh delapan migrasi/checksum terverifikasi. Bukti: `.tmp/phase3-rehearsal-2026-11-24T04-10-02.698Z/`, khususnya `execution.log`, `stage3e1e-result.json`, dan `result.json`. Container `wellbeing-phase3-208a5aada8` dihentikan oleh harness; volume sintetis dipertahankan.

Keterbatasan lama tetap tercatat: Prisma migrate diff single-schema menghasilkan P4002 untuk FK public.users ke auth.users. Harness memeriksa katalog/constraint terpisah; schema tidak diubah untuk menyembunyikan batasan ini. Hasil tersebut bukan hosted migration-readiness acceptance.

## K. Blocker dan syarat aktivasi

Status keseluruhan **PARTIAL**. Produksi memerlukan signer/service principal dengan custody independen, verifikasi identitas nyata dan threat-model review; prototipe HMAC dalam proses website tidak mencukupi. Diperlukan Stage 3E.1F untuk attestation/finalization Storage dan integrasi report routes. Proyeksi baca appointment dan kontrak dashboard admin perlu penyelesaian terpisah. Page boundary belum terintegrasi. Persetujuan institusi untuk lifecycle, kebijakan Human Chat, dan hosted acceptance belum tersedia.

Tidak ada aktivasi otomatis melalui environment flag, fallback privileged setelah konfigurasi runtime, hosted mutation, perubahan secrets, schema/migration historis, Flutter, atau shared Auth trigger. Tidak ada commit/push/merge/deploy. Jalur legacy produksi belum diklaim least-privilege; tetap dipertahankan sesuai larangan mengganti authorization produksi dengan prototipe belum lengkap.

## L. Berkas, Git dan langkah berikutnya

Branch kerja `riehand_branch`. Sebelum tahap ini sudah terdapat perubahan admin service (+13 baris) dan deliverable Stage B/C/D untracked; semuanya dipertahankan. Berkas `tatus` bukan hasil tahap ini.

Berkas tracked yang diubah tahap ini:

- `src/lib/prisma.ts`
- `src/lib/auth/session.ts`
- `src/lib/assessment/http.ts`, `src/lib/assessment/service.ts`
- `src/lib/appointments/http.ts`, `src/lib/appointments/service.ts`
- `src/lib/consultations/service.ts`, `src/lib/consultations/chat-service.ts`
- `src/lib/admin/http.ts`, `src/lib/admin/service.ts`
- `src/lib/psychologist/http.ts`

Berkas baru: `src/lib/dal/context.ts`, `src/lib/appointments/runtime.ts`, `src/lib/consultations/chat-runtime.ts`, `tests/dal-context.test.ts`, `tests/rehearsal/stage3e1e.rehearsal.ts`, `vitest.stage3e1e.rehearsal.config.ts`, `scripts/stage3e1e-checks.mjs`, `scripts/stage3e1e-rehearsal.mjs`, dan laporan ini. Artefak log/snapshot berada di `.tmp`, bukan perubahan environment/secrets.

Ringkasan Git: 11 berkas tracked, total working-tree diff +111/-8 terhadap HEAD; 13 penambahan admin service berasal dari tahap sebelumnya, sehingga delta tracked tahap E adalah +98/-8. Ada 9 berkas baru tahap E (DAL/runtime, tes/harness/config, laporan); file untracked tahap sebelumnya tidak dihitung sebagai hasil baru E. Pemeriksaan whitespace mencakup tracked dan sembilan file baru secara terpisah.

Setelah laporan final, pekerjaan dihentikan menunggu instruksi. Aktivasi produksi bukan bagian tahap ini.
