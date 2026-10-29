# PROGRESS-FASE3

- **Pembaruan:** 29 Oktober 2026
- **Branch:** `Phase3`
- **HEAD lokal:** `cd44289` (perubahan Phase 3 masih belum di-commit)
- **Status publikasi:** tidak ada commit, push, migrasi hosted, perubahan privilege, atau deployment pada verifikasi ini. Ref remote tidak diperiksa.

## Ringkasan

- **B1 - Profil psikolog dan direktori peserta:** tetap berfungsi; pemeriksaan regresi lokal lulus.
- **B2 - Ketersediaan psikolog:** implementasi lokal selesai dan dapat dikembangkan terpisah dari report generation. Tiga sesi tetap menggunakan `Asia/Jakarta`: 09:00-11:00, 13:00-15:00, dan 16:00-18:00.
- **B3 - Booking dan report consent:** implementasi serta verifikasi lokal selesai. Booking memerlukan consent baru yang eksplisit dan affirmative; appointment, consultation session, reservasi slot, dan grant consent dibuat dalam satu transaksi. Status appointment langsung `CONFIRMED`.
- **Batas penerimaan produksi B3:** Phase 2 saat ini membuat metadata report berstatus `PENDING`. Berdasarkan kontrak report dan field repository (`status`, `filePathOrObjectKey`, `generatedAt`), `GENERATED` berarti report assessment yang usable telah dibuat dan disimpan sebagai artifact privat dengan metadata valid. Booking produksi tetap tertahan sampai workflow report-generation nyata tersedia dan diverifikasi. Phase 3 tidak menambahkan generator PDF.
- **Workstream terpisah:** PDF privat/report generation, consultation chat, Superadmin, dan integrasi Chatbot tetap terpisah dari B2/B3.

## Aturan Appointment dan Consent

- Booking memakai assessment terbaru milik participant yang sudah selesai dan memuat DASS-21 serta WEMWBS, berikut report yang terkait dan valid berstatus `GENERATED`. Server memeriksa ownership dan association; `PENDING`, report participant lain, report lama, atau report yang tidak cocok ditolak.
- Checkbox booking consent selalu tidak tercentang pada awalnya. Setiap booking harus menerima affirmative action baru. Consent standalone yang sudah ada tidak dapat memenuhi prasyarat booking.
- `APPOINTMENT_REPORT_ACCESS` harus terhubung ke appointment yang sama dan mencocokkan participant, report, serta psychologist. `STANDALONE_REPORT_ACCESS` harus tanpa appointment. Kedua tipe diperiksa sebagai izin yang berbeda.
- Grant merekam purpose, scope, policy version, dan timestamp server. Revocation segera menghapus izin dari grant tersebut tanpa membatalkan appointment atau menutup consultation. Grant standalone lain yang cocok tetap diperiksa terpisah.
- Grant appointment berakhir pada event pertama: revocation, early closure oleh psychologist yang ditugaskan, scheduled end, cancellation yang sah, atau confirmed terminal no-show. Server memeriksa waktu authoritative tanpa bergantung pada auto-close job. Observasi lifecycle dari consent list, revoke, re-consent, atau report access mematerialisasi `expired_at` dan satu event `EXPIRED`; event sistem memakai actor type `SYSTEM` tanpa user ID. Re-consent membuat grant baru; grant revoked/expired tidak diaktifkan kembali.
- Slot tidak dapat dipesan setelah waktu mulai berlalu. Database transaction dan partial unique index mencegah double booking serta menjaga appointment historis. Availability hanya dilepas lewat transisi yang berizin dan saat penggunaan ulang memang diizinkan.
- Kebijakan umum cancellation tetap di backlog; cancellation bukan acceptance criterion yang telah diimplementasikan pada workstream ini. Eligibility dan cutoff reschedule belum disetujui. Replacement di masa mendatang harus mempertahankan riwayat asal, meminta consent baru, dan mengganti slot secara atomik. Consultation selesai tidak dapat dijadikan follow-up otomatis.

## Verifikasi Lokal Aktual

- `npm.cmd test` - **301 tes lulus dalam 21 file**, mencakup auth Phase 1, assessment Phase 2, direktori B1, serta B2/B3 service, API, dan database tests.
- `npm.cmd run test:browser -- --reporter=list` - **59 tes browser lulus** (53 browser assessment yang sudah ada dan 6 skenario B2/B3). Semua data/API respons browser bersifat sintetis. Wrapper browser memulai fixture Vite di `127.0.0.1`, menjalankan Playwright, lalu menghentikan proses Vite yang dibuatnya.
- `npm.cmd exec -- tsc --noEmit` - lulus.
- `npm.cmd run lint` - 0 error, 2 warning `<img>` yang sudah ada pada `src/app/page.tsx` (baris 54 dan 160).
- `npx.cmd prisma generate` dan `npx.cmd prisma validate --schema prisma/schema.prisma` - lulus menggunakan URL PostgreSQL placeholder lokal; tidak membuka koneksi database.
- `npm.cmd run build` - lulus dengan Next.js 16.4.2.
- `git diff --check` - lulus.
- Pencarian source tidak menemukan assignment status `GENERATED` pada kode aplikasi. Perubahan status `GENERATED` hanya ada pada fixture sintetis pengujian; status tersebut tidak dibuat untuk melewati validasi booking.

## Rehearsal PostgreSQL Terisolasi

- **Hasil:** 6/6 tes real PostgreSQL lulus pada 29 Oktober 2026. Database baru `wellbeing_phase3_rehearsal` hanya berisi Auth baseline dan data sintetis.
- **Runtime:** Docker 28.4.0, PostgreSQL 17.11, Prisma 5.22.0; image `postgres:17` dengan digest `sha256:31ba9c94a03ada9988f2bb493a22a75eef3a185884533e5cdbcd498ea835b08f`. Container `wellbeing-phase3-58b930fcc0` dipublikasikan hanya ke `127.0.0.1:50397`.
- Setelah rehearsal, semua container sintetis Phase 3 yang dibuat untuk verifikasi telah dihentikan; volume serta file evidence lokal tetap disimpan.
- Enam migrasi diterapkan pada database baru dan seluruh checksum cocok dengan file migrasi. Profil/Auth trigger baseline tetap sama sebelum dan sesudah migrasi Phase 2, B1, dan B2/B3.
- Tes menolak report `PENDING` tanpa memesan slot; membuat booking `CONFIRMED` dengan consent atomik; membuktikan object-level authorization, revoke, re-consent sebagai grant baru, dan isolasi consent standalone; memmaterialisasi expiry scheduled end, early close, cancellation, serta no-show; serta membuktikan late revoke/re-consent tetap mencatat expiry yang lebih dahulu.
- Uji contention memakai koneksi PostgreSQL independen. Dua backend (`154` dan `173`) menunggu pada lock slot yang dipegang backend `171`; sesudah lock dilepas, tepat satu appointment dan satu linked consent berhasil dibuat.
- Fault injection saat insert consent membuktikan rollback penuh: slot kembali tersedia, dan appointment, consultation session, consent, serta audit event tidak tertinggal.
- Evidence lokal yang diabaikan Git: `.tmp/phase3-rehearsal-2026-10-29T10-49-53.129Z/` (`result.json`, `isolation.json`, `checks.jsonl`, dan log). Ini bukan verifikasi hosted Supabase.

## Batas dan Pekerjaan Berikutnya

- B3 belum diterima untuk produksi sampai report-generation workflow nyata menghasilkan artifact privat, menyimpan metadata yang dapat digunakan, dan membuktikan transisi `GENERATED`. Test lokal menggunakan artifact fixture sintetis; tidak ada data participant produksi atau generated PDF nyata.
- Tidak ada migrasi yang diterapkan ke Supabase hosted, tidak ada shared schema atau privilege yang diubah, dan tidak ada deployed resource yang disentuh. Deployment memerlukan persetujuan terpisah serta review database bersama.
- Workstream lifecycle konsultasi mendatang tetap mencakup check-in participant/psychologist, deteksi psychologist terlambat, no-show, early closure oleh psychologist, system auto-closure, dan batas waktu konsultasi. Participant tidak dapat mengakhiri sesi secara manual. Sistem tidak membuat consultation follow-up otomatis.
- Rekomendasi workstream berikutnya: **private PDF report generation** sesuai kontrak report yang ada. Tetap pisahkan chat konsultasi, Superadmin, dan Chatbot. Kebijakan cancellation umum serta eligibility/cutoff reschedule menunggu keputusan.

## Inventory Perubahan Lokal

Total **59 file** berubah atau baru, belum di-commit.

### Dokumentasi (10)

- `docs/API CONTRACT.md`
- `docs/BUSINESS RULES.md`
- `docs/ERD.md`
- `docs/FUNCTIONAL REQUIREMENT.md`
- `docs/NON FUNCTIONAL REQUIREMENT.md`
- `docs/PHASE3-B1-STATUS.md`
- `docs/PROGRESS-FASE3.md`
- `docs/SYSTEM ARCHITECTURE.md`
- `docs/USE CASE DESCRIPTION.md`
- `docs/USE CASE SPECIFICATION.md`

### Schema, migrasi, konfigurasi, dan tooling verifikasi (9)

- `prisma/schema.prisma`
- `prisma/migrations/20261029000000_psychologist_availability/migration.sql`
- `prisma/migrations/20261029000001_appointments_report_consent/migration.sql`
- `package.json`
- `playwright.config.ts`
- `vitest.phase3.rehearsal.config.ts`
- `scripts/phase3-rehearsal.mjs`
- `scripts/phase3-safety.mjs`
- `scripts/run-browser-tests.mjs`

### Aplikasi (30)

- `src/app/api/appointments/[appointmentId]/report-consent/route.ts`
- `src/app/api/appointments/[appointmentId]/route.ts`
- `src/app/api/appointments/booking-context/route.ts`
- `src/app/api/appointments/route.ts`
- `src/app/api/consents/[consentId]/revoke/route.ts`
- `src/app/api/consents/psychologist-report/route.ts`
- `src/app/api/consents/route.ts`
- `src/app/api/psychologist/appointments/route.ts`
- `src/app/api/psychologist/availability/[date]/route.ts`
- `src/app/api/psychologist/availability/route.ts`
- `src/app/api/psychologists/[psychologistId]/availability/route.ts`
- `src/app/api/reports/[reportId]/route.ts`
- `src/app/participant/appointments/page.tsx`
- `src/app/participant/participant.css`
- `src/app/participant/psychologists/[psychologistId]/page.tsx`
- `src/app/psychologist/dashboard/page.tsx`
- `src/app/psychologist/psychologist.css`
- `src/components/participant/appointment-center.tsx`
- `src/components/participant/dashboard.tsx`
- `src/components/participant/psychologist-availability.tsx`
- `src/components/participant/shell.tsx`
- `src/components/psychologist/appointment-list.tsx`
- `src/components/psychologist/availability-editor.tsx`
- `src/lib/appointments/http.ts`
- `src/lib/appointments/service.ts`
- `src/lib/psychologist/availability-config.ts`
- `src/lib/psychologist/http.ts`
- `src/lib/psychologist/service.ts`
- `src/lib/validations/appointment.ts`
- `src/lib/validations/availability.ts`

### Pengujian (10)

- `tests/appointment-api.test.ts`
- `tests/appointment-database.test.ts`
- `tests/appointment-service.test.ts`
- `tests/browser/phase3.spec.ts`
- `tests/phase3-safety.test.ts`
- `tests/psychologist-availability-api.test.ts`
- `tests/psychologist-availability-service.test.ts`
- `tests/psychologist-database.test.ts`
- `tests/rehearsal/phase3.rehearsal.ts`
- `tests/visual/main.tsx`
