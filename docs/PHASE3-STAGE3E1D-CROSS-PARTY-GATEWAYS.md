# Stage 3E.1D - Cross-party gateways

## A. Baseline
Baseline Stage 3E.1C PARTIAL, branch riehand_branch. Booking/consent/lifecycle/chat mutations belum tersedia. Snapshot status dan hash prior deliverables serta delapan migrasi dibuat sebelum perubahan di .tmp/stage3e1d. Seluruh perubahan lokal sintetis; hosted NOT EXECUTED.

## B. Keputusan trust boundary sebelum implementasi
Signed identity Stage 3E.1B dipertahankan; role dan active dibaca dari DB. Gateway menerima operation inputs, bukan actor/status/timestamp. Empat owner NOLOGIN/NOBYPASSRLS/non-owner tabel memegang privilege per domain. Helper internal tidak diberi EXECUTE kepada runtime. Fixed pg_catalog,wb_guard,pg_temp dan qualified objects. RLS actor/assignment tetap aktif. Purpose interactive diperiksa tetapi tidak menggantikan business validation.

Booking menggunakan GENERATED fixture berprivilege hanya sebagai prasyarat sintetis downstream, bukan bukti Storage atau report finalization. Lifecycle/chat hanya pada DB rehearsal; tidak ada route atau policy produksi yang diaktifkan. Kompromi signer/website process tetap dapat memalsukan actor; custody signer produksi belum diselesaikan.

## C. Booking gateway
`book_appointment` memvalidasi participant aktif, assessment completed terbaru miliknya beserta score, metadata report GENERATED, psikolog aktif, pemilik/status slot, waktu mulai Asia/Jakarta, dan consent afirmatif. Actor, status, serta timestamp tidak diterima sebagai input. Lock profil dan slot melindungi reservasi; appointment CONFIRMED, session SCHEDULED, consent dan audit ditulis dalam satu transaksi. Pengulangan booking slot yang sudah terpakai ditolak sesuai kontrak lama. Fixture GENERATED tidak membuktikan keberadaan file PDF.

## D. Consent gateways
Grant menerima scope report/psikolog/appointment dan persetujuan; identitas diturunkan dari context terverifikasi. Grant aktif duplikat ditolak, revoke berulang mengembalikan waktu semula, regrant membuat riwayat baru. `expire_consents` hanya menghitung boundary dari deadline/terminal state tersimpan; tidak menerima actor SYSTEM atau waktu dari caller. Consent mandiri tidak ikut berakhir ketika appointment ditutup. `report_access` memeriksa assignment, pihak aktif, revoke/expiry, dan menambahkan audit ACCESSED; hasil hanya ID consent, bukan artifact atau data klinis.

## E. Lifecycle gateways
Check-in peserta, check-in psikolog, start dan end memakai matriks development yang sudah ada, server clock, status appointment/session konsisten, dan lock appointment lalu session. End oleh psikolog memperbarui kedua status dan merekonsiliasi expiry. Tidak ada aturan baru untuk late, no-show, cancellation, reschedule atau reopen. Database guard membatasi operasi ke database rehearsal; adapter juga memakai `developmentPolicyEnabled`.

## F. Human Chat gateway
Send/read mensyaratkan kedua pihak aktif, assignment benar, kedua check-in, status IN_PROGRESS, dan window terbuka. Sender diturunkan dari identitas; body dibatasi 2.000 unit UTF-16 termasuk pemeriksaan SQL langsung. Kunci idempotency terikat session/sender/client UUID; perubahan body pada kunci sama ditolak. Cursor UUID diselesaikan ke pasangan timestamp/ID milik session oleh SQL; ini kontrak adapter lokal, belum pengganti cursor base64 route produksi. Read mengembalikan DTO tanpa sender UUID.

Body trigger `guard_consultation_message` dan kedua trigger historis dipertahankan. Proposal baru mengubah owner fungsi trigger menjadi `wb_chat`, SECURITY DEFINER dengan search_path tetap, agar deferred trigger tetap dapat memeriksa row di bawah RLS ketika COMMIT sudah keluar dari fungsi send. Owner tersebut tidak memiliki tabel, LOGIN atau BYPASSRLS. Adapter memanggil `confirm_message` dalam transaksi terpisah setelah commit; respons INSERT saja bukan bukti persistensi pada Prisma 5.22.

## G. Privilege matrix
| Role | Kemampuan terbatas |
|---|---|
| website_runtime | EXECUTE gateway; tidak memperoleh broad INSERT/UPDATE domain baru; raw SELECT chat dicabut |
| wb_booking | Baca prasyarat milik actor, lock profil/slot, reservasi slot, INSERT appointment/session/consent/audit |
| wb_consent | Baca scope consent/appointment, INSERT grant/audit, UPDATE hanya revoked_at/expired_at |
| wb_lifecycle | Baca/lock assignment, UPDATE kolom lifecycle tertentu, expire consent dan INSERT audit |
| wb_chat | Baca scope chat, lock assignment/session/profil, INSERT message; tanpa UPDATE/DELETE message |

Keempat role gateway NOLOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS, tanpa kepemilikan tabel dan tanpa membership dari runtime. UPDATE(id) pada profil/appointment/session hanya menyediakan row-lock privilege; runtime tidak dapat SET ROLE ke owner fungsi. RLS tetap mengikat participant atau assigned psychologist. Helper internal tidak executable oleh runtime/PUBLIC. Tidak ada fallback connection deployer.

## H. Transaksi dan concurrency
Tes baru menggunakan koneksi Prisma runtime asli, context Auth sintetis terverifikasi, dan owner fixture hanya untuk setup/fault injection. Mencakup booking atomik/rollback/konkurensi, grant duplikat/revoke/regrant, lifecycle/early close, chat retry/paging/deferred rollback, deadline setelah lock, close-versus-send, revoke-versus-access, dan deactivation-versus-send. Bukti utama dicatat dalam execution.log rehearsal; hasil final di bagian J.

## I. SQL langsung dan trust boundary
Input runtime tidak dapat menyuplai actor/status/server time. Tes menolak raw mutation, SET ROLE, unsigned/forged claim, helper expiry, extra sender argument, oversized body dan cross-assignment. Suite B tetap memeriksa HMAC, audience, expiry, PID/transaction binding, pool context dan privilege escalation; suite C memeriksa scoring/projection. Semua delapan migration checksum diperiksa oleh suite sebelumnya. Signer masih berada dalam proses website pada prototipe: kompromi proses tersebut berada di luar jaminan signed context dan memerlukan custody terpisah sebelum produksi.

## J. Hasil validasi aktual
Rehearsal final: **PASS**, PostgreSQL 17.11 dan Prisma 5.22.0. Suite D 25/25; C 14/14; B 17/17; E1 16/16; suite terdahulu 43/43 (total 115 tes PostgreSQL), serta 33 assertion SQL terdahulu. Delapan checksum migrasi dan katalog/data chatbot sintetis diperiksa kembali setelah gateway D dipasang. Bukti: `.tmp/phase3-rehearsal-2026-11-23T05-09-54.078Z/`, terutama `execution.log`, `stage3e1d-result.json`, `stage3e1d-catalog.log`, dan `result.json`. Container `wellbeing-phase3-cf9eb69998`; volume sintetis dipertahankan.

Validasi aplikasi dijalankan sequential setelah rehearsal, dengan konfigurasi proses sintetis localhost; tidak ada perubahan `.env`. Hasil lengkap dicatat di `.tmp/stage3e1d/validation-results.json` dan log per command. Browser memakai harness Vite sintetis yang sudah ada, bukan hosted database.

Keterbatasan tetap: Prisma 5.22 `migrate diff` menghasilkan P4002 untuk FK `public.users -> auth.users` pada datasource single-schema. Harness mencatat keterbatasan tersebut dan memeriksa katalog/constraint terpisah; tidak ada schema/Auth yang diubah untuk menyembunyikan masalah. Ini bukan hosted migration-readiness acceptance.

| Command | Hasil final |
|---|---|
| `npm.cmd test` | PASS: 547 tes, 33 files |
| `npm.cmd run test:browser -- --reporter=list` | PASS: 120 tes pada harness sintetis |
| `npm.cmd exec -- tsc --noEmit` | PASS: exit 0 |
| `npm.cmd run lint` | PASS: 0 error, 2 warning lama `no-img-element` di `src/app/page.tsx:54,160` |
| `npx.cmd prisma validate` | PASS: schema valid |
| `npm.cmd run build` | PASS: Next.js 16.4.6, exit 0 |
| `git diff --check` | PASS: exit 0 |
| `node scripts/stage3e1d-rehearsal.mjs --create-approved-synthetic` | PASS lokal sintetis; 25 tes gateway baru, 115 tes PostgreSQL total |

Kegagalan awal yang ditemukan dan ditangani:
- Engine Docker Desktop awalnya belum aktif; harness berhenti pada guard locality sebelum membuat database.
- Dua run berhenti pada tes fixture Stage B: consent aktif sisa suite lama bertabrakan dengan unique constraint ketika fixture pengganti dibuat. Wrapper D menormalkan grant sintetis participant 9702 menjadi revoked sebelum menjalankan suite B yang tidak diubah. Ini setup owner lokal, bukan keberhasilan revoke gateway.
- Run D pertama: 15/18 PASS; ditemukan UPDATE consent column grant lama, cast integer Prisma, dan assertion SQLSTATE yang perlu diperbaiki.
- Run berikutnya: 23/24 PASS; perbedaan presisi timestamp revoke sebesar 1 ms diperbaiki dengan truncation millisecond dan equality nilai Date.
- Run berikutnya: 24/25 PASS; tes katalog tambahan menemui tipe `aclitem` yang tidak didukung output biner Prisma. Perbandingan kini dilakukan SQL dengan ACL text dan snapshot sebelum instalasi D.
- Typecheck awal menemukan nama field audit `eventType`; diperbaiki menjadi `action` sesuai schema, tanpa mengubah schema.

## K. Blocker dan acceptance matrix
| Workflow | Gateway lokal | Integrasi service aplikasi | Production DAL | Hosted Supabase |
|---|---|---|---|---|
| Booking atomik | PASS | PARTIAL: adapter isolated + validator aplikasi | BLOCKED | BLOCKED / NOT EXECUTED |
| Grant/revoke/expire consent | PASS | PARTIAL: gateway SQL via Prisma, service produksi tidak dialihkan | BLOCKED | BLOCKED / NOT EXECUTED |
| Report access authorization | PASS | PARTIAL: bukti consent saja, tanpa artifact retrieval | BLOCKED | BLOCKED / NOT EXECUTED |
| Lifecycle development | PASS | PARTIAL: adapter + validator/policy gate aplikasi | BLOCKED | BLOCKED / NOT EXECUTED |
| Human Chat | PASS | PARTIAL: adapter + validator dan konfirmasi postcommit | BLOCKED | BLOCKED / NOT EXECUTED |
| Storage attestation/finalization | BLOCKED | BLOCKED | BLOCKED | BLOCKED / NOT EXECUTED |

Keseluruhan tetap **PARTIAL**, bukan runtime architecture COMPLETE. Blocker: custody signer/credential produksi, attestation object Storage, wiring DAL/routes, persetujuan kebijakan lifecycle institusi, serta review privilege/operasional sebelum proposal hosted dapat dipertimbangkan. Gateway hanya berjalan di database rehearsal bernama tetap. Chat produksi tidak diaktifkan. Validasi lokal tidak membuktikan kompatibilitas migrasi shared hosted atau perilaku pengguna Flutter nyata.

## L. Berkas dan rekomendasi
Sebelas berkas baru Stage D:
1. `docs/PHASE3-STAGE3E1D-CROSS-PARTY-GATEWAYS.md`
2. `docs/sql/stage3e1d/01-privileges.sql`
3. `docs/sql/stage3e1d/02-consent.sql`
4. `docs/sql/stage3e1d/03-booking.sql`
5. `docs/sql/stage3e1d/04-lifecycle.sql`
6. `docs/sql/stage3e1d/05-chat.sql`
7. `scripts/stage3e1d-rehearsal.mjs`
8. `scripts/stage3e1d-checks.mjs`
9. `tests/rehearsal/stage3e1d-services.ts`
10. `tests/rehearsal/stage3e1d.rehearsal.ts`
11. `vitest.stage3e1d.rehearsal.config.ts`

Ringkasan diff tahap D: 11 berkas baru, 748 baris tambahan, 0 penghapusan; berkas masih untracked sesuai larangan commit. `git diff --numstat` menampilkan hanya perubahan baseline tahap C (+13 pada admin service), sehingga daftar dan jumlah berkas baru diperiksa terpisah. Semua berkas baru juga lulus `git diff --no-index --check` terhadap empty file.
Tidak ada perubahan source produksi pada tahap D. `src/lib/admin/service.ts` sudah memiliki +13 baris dari tahap C sebelum pekerjaan ini, dan tidak disentuh. Berkas untracked tahap sebelumnya serta `tatus` dipertahankan. Snapshot 39 berkas baseline menghasilkan 0 perubahan hash; migrasi historis tidak ditulis ulang. Tidak ada perubahan paket, environment secret, hosted role/trigger/database, commit, push, merge, atau deploy. Artefak sementara/log berada di `.tmp`; container rehearsal dihentikan oleh harness dan volume sintetis dipertahankan untuk pemeriksaan.

Langkah berikutnya membutuhkan instruksi terpisah: review proposal dan custody, selesaikan Storage attestation, lalu rencanakan wiring DAL yang diuji tanpa fallback owner. Jangan menjalankan SQL proposal ini terhadap hosted database berdasarkan hasil lokal saja.
