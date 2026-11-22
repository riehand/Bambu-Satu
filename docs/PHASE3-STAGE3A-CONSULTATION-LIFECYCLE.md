# Phase 3 Stage 3A — Consultation Lifecycle

Tanggal laporan: 21 November 2026, Asia/Jakarta. Branch: `riehand_branch`.

Implementasi dan verifikasi lokal/sintetis saja. Tidak ada koneksi hosted Supabase, migrasi hosted, perubahan Auth bersama, akses objek Flutter hosted, commit, push, merge, atau deployment. Tidak ada schema/migration/package/environment secret yang diubah.

## A. Temuan implementasi awal

- Worktree awal memuat sepuluh berkas Stage 2B.3 yang belum di-commit. Hash awal disimpan di `.tmp/stage3a/preserved-worktree.json`; seluruhnya dipertahankan byte-for-byte, termasuk script rehearsal, C4, hardening SQL, tes, dan dokumen. Evidence Stage 2B.3 sebelumnya tidak ditimpa.
- Next.js 16.4.2, React 19, Prisma 5.22.0. AGENTS.md dan dokumentasi Route Handler lokal di `node_modules/next/dist/docs/` dibaca sebelum implementasi. API menggunakan async route params, wrapper appointmentApi, respons success/error terstruktur, private/no-store, pemeriksaan origin, dan Supabase `auth.getUser()`.
- Booking sudah atomik: CONFIRMED appointment, SCHEDULED consultation, slot BOOKED, dan consent/audit. Lifecycle belum memiliki layanan/endpoint/tombol operasional.
- Schema sudah memuat semua status, timestamp, endedBy dan endReason yang diperlukan. SQL membatasi window dua jam, FK, serta keunikan appointment/session, tetapi tidak memvalidasi seluruh transisi atau kesamaan kedua window; layanan baru memeriksa konsistensi tersebut. Tidak diperlukan migrasi.
- Resolver consent lama sudah menolak akses setelah scheduledEndAt atau early closure dan mengevaluasi standalone grant secara terpisah. Download memeriksa izin sebelum dan setelah pembacaan artifact. Implementasi PDF/Storage tetap digunakan.
- Hosted baru mempunyai dua migrasi menurut baseline pemilik. Keberhasilan rehearsal tidak menyatakan hosted atau production siap.

## B. Berkas baru dan dimodifikasi

Baru untuk Stage 3A:

1. `src/lib/consultations/policy.ts` — window, eligibility, consistency dan effective status.
2. `src/lib/consultations/service.ts` — scoped reads, DTO, check-in/start/end transaksi.
3. `src/lib/validations/consultation.ts` — UUID, whitelist command, body kosong strict.
4. `src/app/api/consultations/route.ts` — GET scoped.
5. `src/app/api/consultations/[appointmentId]/[action]/route.ts` — POST command terbatas.
6. `src/components/consultations/dashboard.tsx` — panel peserta/psikolog.
7. `src/components/consultations/dashboard.css` — layout responsif mengikuti card/button yang ada.
8. `scripts/stage3a-rehearsal.mjs` — adapter harness Stage 2B.3 tanpa mengedit file asal.
9. `scripts/stage3a-reconciliation.ts` — prototipe rekonsiliasi hanya untuk rehearsal terisolasi.
10. `vitest.stage3a.rehearsal.config.ts` — konfigurasi DB test dengan isolation guard.
11. `tests/consultation-service.test.ts` — 31 tes layanan/policy.
12. `tests/consultation-api.test.ts` — 22 tes API.
13. `tests/rehearsal/stage3a.rehearsal.ts` — 12 tes PostgreSQL nyata.
14. `tests/browser/consultation-lifecycle.spec.ts` — delapan tes browser sintetis.
15. `docs/PHASE3-STAGE3A-CONSULTATION-LIFECYCLE.md` — laporan ini.

Empat berkas tracked dimodifikasi untuk Stage 3A:

- `src/app/participant/appointments/page.tsx` — menyisipkan panel peserta pada navigasi yang ada.
- `src/app/psychologist/dashboard/page.tsx` — menyisipkan panel psikolog.
- `src/lib/appointments/service.ts` — menambahkan helper expiry yang memakai resolver lama; booking dan authorization PDF tidak diubah.
- `tests/visual/main.tsx` — mendaftarkan view fixture Vite; bukan route Next.js atau auth bypass.

Total Stage 3A: 19 berkas (15 baru, empat dimodifikasi). Sepuluh berkas Stage 2B.3 adalah pekerjaan sebelumnya, bukan perubahan baru tahap ini. Tidak ada staging.

## C. Fitur peserta

Panel pada `/participant/appointments` menampilkan janji sendiri, nama psikolog, jadwal WIB/Asia/Jakarta, status appointment dan sesi, indikator check-in kedua pihak, start/end aktual, serta kelompok mendatang/berlangsung dan riwayat. Tombol check-in beserta alasan penolakan berasal dari policy server. Peserta tidak memperoleh tombol mulai/akhiri.

Tersedia loading, error, success, empty state, manual refresh, dan polling GET setiap 30 detik. Polling hanya membaca; tidak memulai/menutup sesi. Setelah mutation sukses, data server ditampilkan lalu dimuat ulang. Konflik atau kegagalan mengunci aksi sampai refresh berhasil; tidak ada optimistic start/end. Keyboard, semantic headings, aria-busy/status/alert dan aria-describedby menghubungkan tombol dengan alasannya.

## D. Fitur psikolog

Panel pada `/psychologist/dashboard` hanya mengambil janji yang ditugaskan. Informasi peserta dibatasi nama tampilan; DTO lifecycle tidak membawa email, identitas institusi, jawaban, skor, reportId atau Storage key. Psikolog dapat check-in, mulai setelah kedua check-in, dan mengakhiri sesi aktif lebih awal setelah konfirmasi browser.

Timestamps berasal dari server dan status hanya berubah setelah respons sukses. Report card/download lama tetap berada di dashboard dengan otorisasi consent yang sama. Indikator report card lama adalah snapshot saat komponen dimuat; download tetap memeriksa izin terbaru dan menolak bila appointment consent telah berakhir. Tidak ada chat, video call, atau transport konsultasi baru.

## E. Matriks state transition

| Kondisi awal | Perintah | Syarat | Hasil tersimpan |
| --- | --- | --- | --- |
| CONFIRMED / SCHEDULED | participant-check-in | Peserta pemilik, aktif, development window terbuka | Timestamp peserta sekali; tetap SCHEDULED bila pihak lain belum hadir |
| CONFIRMED / SCHEDULED | psychologist-check-in | Psikolog assigned, aktif, development window terbuka | Timestamp psikolog sekali |
| CONFIRMED / SCHEDULED | Check-in kedua | Kedua timestamp kini tersedia | CONFIRMED / READY |
| CONFIRMED / READY | start | Psikolog assigned, kedua check-in, window terbuka | IN_PROGRESS / IN_PROGRESS, startedAt server |
| IN_PROGRESS / IN_PROGRESS | end | Psikolog assigned, masih sebelum scheduledEndAt | COMPLETED / COMPLETED, endedAt/completedAt server, PSYCHOLOGIST / PSYCHOLOGIST_COMPLETED |
| Check-in sudah tercatat | Check-in sama selama sesi/window valid | Tetap authorized | 200, timestamp asli tanpa write |
| Sudah dimulai | start ulang | Tetap authorized | 409 CONSULTATION_ALREADY_STARTED |
| Sudah selesai manual | end ulang | Psikolog assigned, terminal record sesuai manual completion | 200, timestamp asli; tanpa expiry/audit tambahan |
| Terminal/cancelled/rescheduled/no-show | Check-in atau start | Tidak ada reopening | Ditolak |
| Belum started | end | Invalid transition | 409 CONSULTATION_NOT_STARTED |
| PARTICIPANT_LATE / PSYCHOLOGIST_LATE | Mutasi lifecycle | Kebijakan belum disetujui | Ditolak dengan POLICY_PENDING |
| Window telah berakhir, belum direkonsiliasi | GET | Authorized | Effective WINDOW_ENDED; persisted state tetap, tanpa inferensi no-show |
| IN_PROGRESS setelah akhir jadwal | Prototipe rekonsiliasi terisolasi | Explicit authorization dan local DB identity guard | COMPLETED / COMPLETED, endedAt=scheduledEndAt, SYSTEM / SCHEDULED_END_REACHED |
| SCHEDULED/READY setelah akhir jadwal | Prototipe rekonsiliasi | Belum ada keputusan no-show | Tidak diubah |

SCHEDULED dengan kedua check-in yang sudah ada juga dapat dimulai bila konsisten; status READY merupakan state tersimpan oleh operasi check-in baru, bukan syarat yang menghilangkan bukti kedua check-in. Effective status bukan enum baru di database. Error konsistensi menghentikan transisi dan memberi tampilan “Perlu pemeriksaan data”.

## F. Batas autentikasi dan otorisasi

GET `/api/consultations` dan POST `/api/consultations/{appointmentId}/{action}` memakai `appointmentApi("PARTY")`. Guard memverifikasi Supabase user terkonfirmasi dan profil aktif dengan authoritative role. SUPERADMIN tidak mendapat akses otomatis. Layanan memeriksa kembali profil aktif/role; mutation menguncinya untuk menghindari perubahan peran saat operasi berlangsung.

Action hanya `participant-check-in`, `psychologist-check-in`, `start`, atau `end`. Body wajib JSON `{}`. participantId, psychologistId, role, status, timestamps, cancel/reschedule/no-show/reopen ditolak; tidak ada endpoint update status bebas. UUID divalidasi. Identitas berasal dari guard, waktu berasal dari server setelah menunggu lock. Origin write diperiksa mengikuti konvensi lama.

Query appointment selalu scoped pada actor. Rekaman pihak lain menghasilkan 404 generik. Hasil minimal hanya berisi jadwal, nama counterpart, status, timestamp dan eligibility. Raw Prisma/SQL errors dipetakan wrapper ke 503 generik, tidak diteruskan ke browser. GET lifecycle tidak memutasi appointment, session, consent atau audit.

## G. Transaksi dan konkurensi

- READ COMMITTED transaction dengan maxWait 5 detik dan timeout 15 detik.
- Urutan lock write: user actor FOR SHARE, appointment milik actor FOR UPDATE, session FOR UPDATE, lalu appointment grants berurutan id pada completion. Appointment/session dibaca ulang setelah lock.
- Role aktif diperiksa setelah user lock; timestamp diambil setelah semua lock yang berpotensi menunggu. Permintaan yang melewati batas waktu ketika menunggu ditolak.
- Check-in serial pada satu appointment mencegah lost update dan mempertahankan timestamp awal. Start/end mengubah kedua record dalam transaksi yang sama.
- Completion mengunci appointment grants, mengubah lifecycle, lalu memakai expiry resolver dan append audit EXPIRED dalam transaksi yang sama. Kegagalan update appointment maupun insert audit telah diuji dengan trigger injeksi: seluruh perubahan rollback.
- Uji PostgreSQL memegang lock dari koneksi blocker dan membuktikan sedikitnya dua backend PID berbeda menunggu sebelum dilepas. Hasil diverifikasi dari database, bukan hanya mock Promise.
- UI mencegah duplicate submission memakai ref busy selain disabled state; response GET lama dibatalkan/diabaikan memakai AbortController dan sequence. Cleanup unmount membatalkan request dan interval. Abort browser bukan janji rollback server; refresh tetap sumber kebenaran.

Prototipe `reconcileSyntheticConsultation` hanya menerima otorisasi `synthetic-local-only`, NODE_ENV=test, target localhost/port/db yang diset harness, serta marker DB yang cocok. Dua reconciler bersamaan menghasilkan satu completion dan satu EXPIRED audit. Tidak ada scheduler, route cron, service credential produksi, atau CLI yang memproses hosted. Scheduler produksi kelak membutuhkan persetujuan operator, service identity least-privilege, batching, retry/observability, dan aturan untuk sesi yang belum dimulai.

## H. Regresi consent dan PDF

| Persyaratan | Bukti |
| --- | --- |
| Assignment psikolog dan scope report | Existing report authorization tests + PostgreSQL denial untuk psikolog lain |
| Standalone independen | Akses masih valid dengan standalone setelah early closure; standalone tidak expired/revoked oleh completion |
| Revoked/expired denial | Suite existing dan uji revoke standalone setelah closure |
| Early closure | Appointment grant expiredAt tercatat; appointment-scoped artifact authorization ditolak |
| Scheduled end tanpa job | Final download authorization ditolak saat effective WINDOW_ENDED, walau persisted session masih IN_PROGRESS |
| Start tidak membuat consent | Jumlah grant sebelum/sesudah start tetap |
| Audit historis | Event lama dipertahankan; EXPIRED baru satu kali; rollback bila audit gagal |
| SUPERADMIN | API/authorization regression lama tetap menolak akses report berdasarkan role saja |

Tidak ada perubahan renderer PDF, generation, Storage, scoring, atau isi consent. GET consent/report lama dapat mematerialisasi expiry seperti sebelum tahap ini; hal tersebut tidak mengubah lifecycle appointment/session. Persetujuan appointment tidak pernah diperpanjang melewati scheduledEndAt untuk menunggu scheduler.

## I. Hasil tes aktual

| Command | Hasil |
| --- | --- |
| `npm.cmd test` | PASS: 424/424 tes, 29 file; 53 tes Stage 3A baru |
| `npm.cmd run test:browser -- --reporter=list` | PASS: 90/90 tes, termasuk delapan tes lifecycle baru; final rerun 58,9 detik |
| `npm.cmd exec -- tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run lint` | PASS, 0 error; dua warning lama next/no-img-element di src/app/page.tsx:54 dan :160 |
| `npx.cmd prisma validate` | PASS, Prisma 5.22, URL localhost placeholder tanpa koneksi database |
| `npm.cmd run build` | PASS pada pengulangan, exit 0; 34 halaman dihasilkan, dua route lifecycle terdaftar |
| `git diff --check` | PASS; seluruh 24 file untracked juga lolos pemeriksaan whitespace tanpa staging |
| `node scripts/stage3a-rehearsal.mjs --create-approved-synthetic` | PASS: 6 tes PostgreSQL lama + 12 tes lifecycle baru; 33 SQL checks Stage 2B.3; 7 checksum cocok |

Focused run: 53/53 unit/API baru dan 8/8 browser baru lulus. Rehearsal final memakai PostgreSQL 17.11 dan Prisma 5.22. Evidence: `.tmp/phase3-rehearsal-2026-11-20T16-57-57.270Z/` (timestamp folder UTC), termasuk result.json, execution.log, stage3a-checks.jsonl, isolation.json dan checks SQL Stage 2B.3. Folder berbeda dibuat untuk setiap run; volume/evidence dipertahankan dan container dihentikan oleh harness. Pemeriksaan `docker inspect` terakhir mengonfirmasi container `wellbeing-phase3-9682eca6ac` berstatus exited. Wrapper tanpa flag pembuatan hanya mencetak petunjuk dan tidak membuat database.

Kegagalan/perbaikan yang benar-benar terjadi:

1. Unit runner pertama ditolak sandbox `spawn EPERM`; diulang dengan izin child process lokal dan lulus.
2. Docker pertama tidak aktif; run berhenti di docker-locality sebelum mutation. Docker Desktop lokal dinyalakan lalu rehearsal berhasil.
3. Lint menemukan nama variabel `module` pada adapter dan indirect setState-in-effect pada loader; diperbaiki tanpa suppressions. Lint ulang lulus.
4. Prisma migrate diff menghasilkan P4002 lintas schema public.users→auth.users, keterbatasan Stage 2B.3 yang tetap dilaporkan oleh harness. migrate deploy/status, checksum, catalog dan behavioral checks lulus; tidak ada klaim seluruh schema bebas drift.
5. Saat build dan browser suite berjalan bersama, fixture font membaca direktori `.next/static/media` yang sedang dibangun ulang dan memunculkan ENOENT. Sesi kemudian terputus sehingga hasil akhirnya tidak diklaim lulus. Validasi final dijalankan berurutan.
6. Build setelah melanjutkan sesi berhasil compile/typecheck/render, tetapi berhenti dengan SecurityFatalError berupa pemberitahuan keamanan versi Next.js. Pengulangan command yang sama selesai exit 0 dengan warning keamanan tetap tampil. Paket tidak di-upgrade; review/remediasi keamanan dependency diperlukan sebelum deployment.

Build menggunakan placeholder localhost untuk database/Supabase, tidak credential hosted. Auth baseline Docker sintetis bukan full Supabase Auth/GoTrue. Rehearsal memakai postgres berprivilege; keberhasilan authorization aplikasi bukan bukti runtime DB least-privilege. Tidak ada uji hosted, real Storage, production backup restore atau penerimaan UAT.

## J. Matriks keputusan kebijakan institusi

| Keputusan | Implementasi sementara | Approval yang dibutuhkan |
| --- | --- | --- |
| Check-in window/grace period | Hanya development/test: start inclusive, end exclusive | Rentang resmi, early check-in, grace period |
| Mulai sesi | Kedua check-in dan dalam window; production start/check-in diblokir | Aturan mulai resmi dan kesiapan rollout |
| Late threshold | Tidak dihitung; status existing ditampilkan dan mutasinya ditahan | Ambang per pihak dan konsekuensinya |
| NO_SHOW | Tidak pernah dibuat otomatis | Penanggung jawab, bukti, konfirmasi manual atau otomatis |
| Cancellation/reschedule/reopen | Tidak ada endpoint atau tombol | Aktor, cutoff, dampak slot/consent dan audit |
| Akhir jadwal | Effective status read-only, report denial langsung; prototype hanya lokal | Scheduler operator/identity, recovery dan status sesi yang belum dimulai |
| Early end | Psikolog assigned mengakhiri IN_PROGRESS sebelum end; standalone independen | Review institusi sebelum UAT/production |

Tidak ada environment flag yang mengaktifkan asumsi window development di NODE_ENV=production. Setelah keputusan resmi, ubah policy terpusat dan tes boundary sesuai kebijakan versioned; jangan menyalin aturan ke UI/API. UI hanya memakai eligibility yang dikembalikan server.

## K. Keterbatasan dan blocker produksi

- Hosted migrations/security preparation/Storage bucket belum diterapkan. Ikuti Stage 2B.3 dan approval owner/Flutter; tidak termasuk otorisasi tahap ini.
- Check-in/start produksi sengaja tidak aktif sebelum kebijakan institusi disetujui. Late/no-show/cancel/reschedule/reopen tetap blocker kebijakan.
- Tidak ada scheduler aktif. Data persisted dapat tetap IN_PROGRESS setelah jadwal, sementara effective status dan consent sudah menolak aksi/akses. Prototipe hanya menerima database rehearsal lokal, bukan sarana rollout produksi.
- Polling 30 detik/manual refresh bukan realtime. Tombol dapat mencerminkan snapshot sebelumnya sampai refresh; backend selalu menguji ulang waktu dan status.
- Daftar lifecycle belum dipaginasi; volume data besar memerlukan pagination dan pengujian kapasitas sebelum penggunaan luas.
- Baseline Auth sintetis, runtime PostgreSQL berprivilege, risiko service_role, P4002, dan perbedaan declaration policy_version dari Stage 2B.3 belum diselesaikan oleh tahap ini.
- Tidak ada perubahan paket; peringatan keamanan dependency yang muncul saat build dicatat bersama hasil final dan memerlukan pekerjaan terpisah.

## L. Tahap berikutnya: Human Chat

Tahap berikutnya dapat menambahkan human chat setelah kebijakan lifecycle dan batas akses disetujui. Desain perlu mengikat ruang ke appointment/session dan kedua pihak, memakai authoritative membership/status, serta menetapkan retention, moderation/escalation institusional, attachment privacy, reconnect/ordering/idempotency, dan penolakan setelah closure. Assessment/PDF tidak otomatis menjadi isi chat. Rancang migrasi terpisah dan uji diisolasi; jangan memakai schema/ledger Flutter atau menyamakan chatbot dengan human consultation. Belum ada implementasi chat pada Stage 3A.

## Git status akhir

Tidak ada commit, staging, push, merge atau deploy. Hash sepuluh berkas awal Stage 2B.3 diverifikasi terpisah dari perubahan Stage 3A dan semuanya identik. Status mencakup pekerjaan sebelumnya:

```text
 M scripts/phase3-rehearsal.mjs
 M src/app/participant/appointments/page.tsx
 M src/app/psychologist/dashboard/page.tsx
 M src/lib/appointments/service.ts
 M tests/visual/main.tsx
?? docs/PHASE3-STAGE3A-CONSULTATION-LIFECYCLE.md
?? docs/STAGE2B3-DATABASE-READINESS.md
?? docs/sql/
?? prisma/migrations/20261120000000_psychologist_profiles_integrity/
?? scripts/stage2b3-rehearsal-checks.mjs
?? scripts/stage3a-reconciliation.ts
?? scripts/stage3a-rehearsal.mjs
?? src/app/api/consultations/
?? src/components/consultations/
?? src/lib/consultations/
?? src/lib/validations/consultation.ts
?? tests/browser/consultation-lifecycle.spec.ts
?? tests/consultation-api.test.ts
?? tests/consultation-service.test.ts
?? tests/migration-readiness.test.ts
?? tests/rehearsal/stage2b3-postchecks.sql
?? tests/rehearsal/stage3a.rehearsal.ts
?? vitest.stage3a.rehearsal.config.ts
```

`git diff --stat` tracked: lima berkas, +32/-1. Di antaranya +16/-1 pada script phase3-rehearsal sudah berasal dari Stage 2B.3; perubahan tracked Stage 3A sendiri +16/-0 pada empat berkas. Lima belas file Stage 3A baru masih untracked sehingga tidak dihitung oleh diff stat biasa. Total worktree berisi 29 berkas berubah/baru, termasuk sepuluh berkas Stage 2B.3.
