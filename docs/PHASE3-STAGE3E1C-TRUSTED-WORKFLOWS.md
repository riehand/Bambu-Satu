# Stage 3E.1C - Trusted workflows

## A. Baseline
Branch riehand_branch. Snapshot status dan hash seluruh deliverable Stage 3E.1/3E.1B serta migrasi disimpan di .tmp/stage3e1c sebelum implementasi. Semua pekerjaan lokal sintetis; hosted NOT EXECUTED.

## B. Keputusan trust boundary sebelum implementasi
Signed actor bukan izin sistem. HMAC/verifier Stage 3E.1B dipertahankan. Pemegang SQL website_runtime tanpa signature valid tidak dapat menyamar. Kompromi proses website yang memegang signer key dapat menyamar sebagai pengguna mana pun; produksi memerlukan custody signer terpisah. SQL injection dalam transaksi valid dapat menjalankan semua operasi yang memang diizinkan untuk aktor tersebut.

Gateway submit menerima hanya session UUID dan expected revision, menghitung dari jawaban tersimpan, memvalidasi konfigurasi immutable, kemudian memasukkan skor/report PENDING dan menyelesaikan sesi atomik. Tidak menerima totals, actor UUID, artifact, atau role. Owner NOLOGIN/NOBYPASSRLS bukan pemilik tabel; policy own-subject tetap berlaku. Fixed search_path, object qualified, EXECUTE hanya runtime, tidak ada membership. Kompromi signer tidak mengizinkan totals berbeda dari jawaban, tetapi dapat mengubah jawaban sesi belum selesai milik identitas yang dipalsukan.

Projection owner read-only dibatasi kolom display dan policy assignment/directory. Aggregate helper lama dipakai tanpa grant klinis baru. Finalisasi report tidak diotorisasi oleh purpose saja: memerlukan worker terpisah yang memverifikasi object private Storage serta digest/konten/session. Tanpa attestasi nyata, operasi tetap BLOCKED. Tidak membuat PDF/attestasi palsu atau mengubah route produksi.


Pemilik helper skor/proyeksi tidak memiliki tabel public, bukan anggota role runtime, dan tidak dapat LOGIN/SET ROLE dari website_runtime. RLS tetap berlaku bagi pemilik helper tersebut; SECURITY DEFINER tidak dipakai sebagai bypass umum. Bentuk fungsi fixed dan seluruh tabel/type qualified, dengan pg_temp eksplisit terakhir pada helper baru, mengikuti [panduan SECURITY DEFINER PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createfunction.html). Policy restrictive digabung dengan AND terhadap policy permissive menurut [dokumentasi RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## C. Desain otorisasi scoring

`wb_guard.submit_assessment(session_id uuid, expected_revision integer)` adalah gateway tunggal yang menerima identitas sesi dan revisi, bukan skor. Dipanggil melalui transaksi Prisma 5.22 dengan login website_runtime dan klaim interactive sah. Gateway:

1. Memastikan actor aktif PARTICIPANT, lalu mengunci users milik actor dan sesi miliknya dalam urutan yang sama dengan service save.
2. Mengembalikan report asli untuk retry sesi COMPLETED; tidak membuat hasil duplikat. Pada sesi belum selesai, revisi harus cocok dan tidak null/negatif.
3. Memeriksa satu periode ACTIVE, kuota, published question set, metadata persetujuan, instruksi, pilihan jawaban, 35 item aktif, serta 35 jawaban yang benar-benar bergabung dengan soal sesi tersebut.
4. Menggunakan constraint historis untuk nomor/dimensi soal dan uniqueness. Menjumlahkan jawaban DASS per dimensi x2, serta WEMWBS tanpa kategori tambahan. Batas kategori sama persis dengan `dass21.ts`; tidak mengubah interpretasi klinis.
5. INSERT skor, INSERT report PENDING tanpa artifact, UPDATE sesi COMPLETED/revisi dalam transaksi yang sama. Trigger immutability dan constraint historis tetap aktif.

Owner `wb_score_gateway` hanya mendapatkan SELECT yang dibutuhkan, UPDATE kolom completion sesi, UPDATE(id) untuk row locks, dan INSERT score/report. RLS membatasi actor/sesi sendiri. Website runtime tetap tidak mempunyai INSERT assessment_scores dan sekarang tidak mempunyai INSERT reports. Tidak ada fungsi penerima totals atau identitas actor lain.

Ditemukan tambahan risiko pola trigger lama: query invoker ke soal draft dapat menghasilkan NULL akibat RLS; perbandingan biasa dengan NULL tidak membuktikan asosiasi sah. Dua policy **restrictive** baru pada INSERT/UPDATE answers mewajibkan relasi soal aktif dengan question_set sesi yang terlihat. Gateway juga menghitung jumlah hasil join canonical, sehingga jawaban tersembunyi/tidak cocok tidak dihitung sebagai lengkap. Migrasi/trigger lama tidak diedit.

Logika scoring SQL terpisah diperlukan agar caller SQL tidak perlu dipercaya. Duplikasi formula dijaga tes parity terhadap mesin TypeScript yang tetap tidak berubah: setiap subtotal DASS 0..21 (total x2 0..42) pada ketiga dimensi, serta WEMWBS termasuk minimum 14/maksimum 70. Perubahan aturan scoring kelak wajib memperbarui implementasi dan tes bersamaan melalui review, bukan mengubah published content.

Integrasi service scoring berada di `tests/rehearsal/stage3e1c-services.ts`. Validasi strict menolak field totals tambahan, kemudian transaksi memanggil gateway dan membaca kembali hasil lewat RLS. Start/save/history memakai service aplikasi asli dengan adapter Stage 3E.1B. **Production submitAssessment dan route belum dialihkan**; bukan klaim produksi siap.

## D. Report finalization dan attestasi Storage

Service saat ini membuat PDF deterministik dari report/session/score, memakai private bucket `assessment-reports`, canonical key `reports/<report UUID lowercase>.pdf`, upload create-only, download ulang dan memeriksa isi PDF sebelum UPDATE PENDING -> GENERATED. Konflik upload/network ditangani lewat read-back; finalize retry memeriksa status/key yang sama. Authorization participant dan consent psikolog merupakan langkah terpisah dari keberadaan artifact. Kode ini tidak diubah.

Database lokal tidak dapat membuktikan object benar-benar berada di private Storage atau isinya cocok dengan hasil resmi. Membatasi format key saja tidak cukup. Karena itu finalisasi artifact tetap **BLOCKED**. Proposal `finalize_report(uuid,text)` adalah kontrak tertutup SECURITY INVOKER: tidak ada jalur sukses atau grant EXECUTE runtime; bahkan bila dipanggil pemiliknya fungsi selalu menolak dengan STORAGE_ATTESTATION_UNAVAILABLE. Ini bukan implementasi worker atau attestasi.

Desain lanjutan yang diperlukan: worker dengan credential/custody terpisah dari website, memverifikasi report owner/session COMPLETED dan skor immutable; membuat/upload PDF, membaca kembali object, memverifikasi digest/konten/key canonical, kemudian mengeluarkan attestasi terikat report/session/hash/versi object/issuer/audience/expiry/nonce. DB finalizer nantinya memverifikasi attestasi dengan trust root yang tidak dimiliki website, mengunci report dan memvalidasi PENDING-null -> GENERATED. Retry identik mengembalikan hasil yang sama; attestasi/key/session berbeda ditolak. Signed actor/purpose website tidak dapat menggantikannya. Kontrak attestasi, key rotation, worker identity dan audit memerlukan implementasi/review tersendiri; tidak diprovision di sini.

Audit sekarang: timestamp completion/calculatedAt/createdAt dan satu hasil immutable; tidak ada ledger finalization baru atau audit produksi yang diklaim. Desain worker memerlukan event append-only berisi actor sistem, report/session, digest, attempt/idempotency key dan outcome tanpa bytes PDF/jawaban/secret. Tidak menumpangkan event pada consent_audit_events karena semantiknya berbeda.

Tes DB membuktikan runtime tidak dapat UPDATE GENERATED, memasukkan fake key, mengubah asosiasi assessment, atau menjalankan finalizer, termasuk dengan signed purpose report-finalize yang sah. Dua request finalization concurrent dan retry tetap mempertahankan PENDING/null metadata. Tes service generation memakai Storage **unavailable**, bukan fake PDF atau fake attestasi: feedback 503 lalu cooldown 429, upload tidak dipanggil, metadata tetap PENDING. Bukti ini bukan end-to-end Storage acceptance.

## E. Proyeksi counterpart

`psychologist_display(uuid)` untuk participant aktif mengembalikan hanya `{id, fullName, active}` psikolog aktif. Ini lookup directory yang memang tidak memerlukan appointment; participant tidak dapat menjadikannya lookup participant lain. Tidak membuka endpoint anonim atau daftar semua users.

`assignment_display(appointment UUID)` untuk kedua pihak mengembalikan `{appointmentId,status,counterpart:{id,fullName,active}}`. Subject harus participant pemilik atau psikolog yang ditugaskan; tidak ada parameter participant UUID bebas. Counterpart harus aktif dan memiliki role yang sesuai. Assignment historis tetap boleh memberikan display operasional bagi kedua pihak, tanpa membuka chat, hasil asesmen atau report.

Owner `wb_display_projection` memiliki SELECT hanya empat kolom users dan empat kolom appointments. Policy users mengizinkan psikolog aktif untuk directory participant, atau participant yang punya appointment dengan psikolog pemanggil. Tidak ada grant email, phone_number, institutional_id, password_hash, atau akses klinis. RLS users milik website_runtime tetap own-profile; SELECT raw counterpart tetap kosong. Proyeksi adalah read-only; active/assignment yang dibaca belum menggantikan lock/recheck pada gateway mutasi booking/lifecycle yang masih di luar scope.

## F. Integrasi agregat Super Admin

Tambahan 13 baris pada `src/lib/admin/service.ts`: `adminRestrictedOverview(actorId,input)` menggunakan validasi tanggal dan `operation()` yang sudah ada (active SUPERADMIN, row lock, RepeatableRead), kemudian memanggil helper Stage 3E.1B `operational_counts(date,date)` lewat parameterized Prisma raw query.

Hanya enam hasil tersedia: activeParticipants, activePsychologists, assessmentsStarted, assessmentsCompleted, appointments, clinicalIndicatorsEnabled=false. Filter periodId ditolak eksplisit karena helper belum mendukungnya; schema strict menolak filter report/user arbitrer. Tidak memalsukan field breakdown/availability yang belum disediakan. `adminOverview` lama dan route produksi tetap sama; fungsi baru dipanggil hanya oleh isolated integration test.

Tes membandingkan jumlah participant aktif dengan assertion owner independen, memeriksa seluruh key output, penolakan role participant/psikolog/inactive admin dan filter tambahan, serta memastikan raw answer/score/report/message count admin nol. Total operasional bukan indikator klinis. Risiko inferensi dari agregat operasional pada rentang sempit tetap perlu kebijakan institusi bila dibutuhkan; tidak menambah filter individu atau membuka clinical metrics.

## G. Matriks privilege/fungsi

| Principal/fungsi | Hak dan batas |
| --- | --- |
| website_runtime | Login sintetis non-owner/non-BYPASSRLS; EXECUTE submit/projections/helper aggregate; tidak INSERT skor/report, UPDATE report, EXECUTE finalizer atau SET ROLE helper |
| wb_score_gateway | NOLOGIN/NOBYPASSRLS/non-owner tabel. SELECT own session/answers/results, published questions/active period, own actor; INSERT score/PENDING report; UPDATE completion fields sesi. Policy per tabel tetap membatasi subject |
| submit_assessment(uuid,integer) | SECURITY DEFINER owned scorer, fixed pg_catalog,wb_guard,pg_temp; argumen tidak memuat totals/actor/artifact; EXECUTE PUBLIC dicabut |
| wb_display_projection | NOLOGIN/NOBYPASSRLS/non-owner; SELECT kolom display users dan assignment appointments saja, policy directory/assignment |
| psychologist_display / assignment_display | SECURITY DEFINER owned projection; identitas signed dan role/relationship diperiksa; EXECUTE PUBLIC dicabut |
| wb_operational_monitor / operational_counts | Tidak diubah dari Stage 3E.1B: kolom operasional terbatas, RLS active SUPERADMIN; tidak ada score/answers/message bodies |
| finalize_report(uuid,text) | SECURITY INVOKER, tanpa grant runtime/PUBLIC, selalu menolak; bukan worker yang aktif |
| owner fixture/deployer | Hanya setup/test oracle/migrasi. Tidak dipakai sebagai fallback jalur aplikasi |

Tes catalog membuktikan helper scorer/projection bukan pemilik tabel, tidak LOGIN/BYPASSRLS/CREATEROLE/CREATEDB, role runtime tidak dapat SET ROLE scorer, dan anon/authenticated/service_role tidak memiliki EXECUTE submit/projection. Tes ACL membuktikan owner projection sendiri tidak memiliki SELECT email/phone/institutional_id.

## H. Acceptance positif

| Workflow | Status | Bukti dan batas |
| --- | --- | --- |
| Trusted assessment submission lokal | PASS | 22 kombinasi parity, sesi COMPLETED, skor resmi dan satu report PENDING atomik, history melalui service asli; seluruh operasi runtime via Prisma 5.22 |
| Retry/concurrent submit lokal | PASS | Dua request menghasilkan ID report yang sama, satu score/report; retry completed mengembalikan hasil lama tanpa menaikkan revisi lagi |
| Report metadata authorization | PASS | PENDING hanya dibuat gateway atomik; user tidak dapat memilih key/association/status GENERATED |
| Report artifact finalization | BLOCKED | Private Storage/worker attestation belum tersedia; tidak membuat artifact/attestasi palsu |
| PDF generation service end-to-end | PARTIAL | Failure/cooldown mempertahankan PENDING diuji dengan Storage unavailable; upload/download nyata tidak diuji |
| Counterpart projection lokal | PASS | Directory participant dan kedua pihak assigned terbaca dengan field minimal; unrelated/inactive/role salah disembunyikan |
| Restricted aggregate service lokal | PASS | Fungsi service admin baru mengonsumsi helper nyata, output terverifikasi dan clinical data tetap tertutup |
| Full dashboard/production DAL cutover | BLOCKED | Route lama tidak dialihkan, signer custody dan adapter auth produksi belum disiapkan |
| Booking/consent/lifecycle/chat mutations | BLOCKED | Tidak termasuk implementasi tahap ini; hak/gateway mutasinya tetap tidak dibuka |

PASS SQL/service lokal tidak berarti production wiring. Owner queries hanya menyiapkan fixture atau menguji hasil persisted, bukan bukti positive runtime. Penolakan 42501 dihitung sebagai tes negatif, bukan workflow sukses.

## I. Negatif, concurrency dan rollback

Tes mencakup direct INSERT/UPDATE official scores; argumen totals tambahan di service/SQL signature; gateway tanpa context/wrong role/cross-owner; purpose report-finalize sah tetapi tidak cocok untuk scoring; klaim subject/purpose dipalsukan; SET ROLE helper; completed answers tetap identik setelah UPDATE nol row; metadata association/key/GENERATED tidak dapat dimutasi; serta EXECUTE finalizer ditolak.

Revisi stale ditolak sebelum scoring. Fault sengaja dilempar setelah gateway menyelesaikan seluruh write tetapi sebelum commit Prisma: session kembali IN_PROGRESS/revision lama, score/report tidak ada; retry bersih lulus. Dua submit bersamaan terserialisasi melalui lock actor/session dan menghasilkan satu hasil. Dua finalization attempts tidak mengubah metadata. Constraint, RLS dan trigger historis tetap berlaku.

Konfigurasi published tetapi instruksi tidak valid dibuat sebagai fixture baru oleh owner dan ditolak gateway tanpa mengedit published content. Soal draft yang tidak terlihat tidak dapat disisipkan ke sesi melalui SQL runtime. Jawaban tidak lengkap dan revision NULL ditolak. Tes shadowing juga membuat tabel sementara users/assessment_sessions dan mengubah search_path pemanggil: gateway tetap menemukan hasil asli, current_user kembali website_runtime, dan CREATE FUNCTION pada wb_guard ditolak. Seluruh tes lama termasuk identity pool reuse/reconnect/rollback, revoked-consent dan expired-chat dijalankan tanpa mengubah berkasnya sebelum proposal C diterapkan.

## J. Regresi dan bukti rehearsal

Rehearsal final: `.tmp/phase3-rehearsal-2026-11-22T16-28-42.941Z/`, selesai 22 November 2026 23:30:01 WIB. PostgreSQL **17.11**, Docker **28.5.1**, Prisma **5.22.0**. Image digest `sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`.

Container `wellbeing-phase3-4e12fe6a65`, volume `wellbeing-phase3-4e12fe6a65-data`, endpoint `127.0.0.1:56635`, database `wellbeing_phase3_rehearsal`. Harness memverifikasi token/locality, mengecualikan hosted credentials dari child environment, dan menghentikan container miliknya; status akhir diperiksa **exited**, volume bukti dipertahankan. Tidak ada production data/hosted Auth yang digunakan.

Bukti: `stage3e1c-checks.jsonl` (14 checks), `stage3e1c-catalog.log` (policy/owner/search_path/ACL), `stage3e1c-result.json` (local scoring/projection/aggregate PASS, artifact/production DAL BLOCKED, keseluruhan PARTIAL), `execution.log`, `isolation.json`, dan `result.json` (delapan checksum). `PASS_SYNTHETIC_POSTGRESQL_ONLY` bukan klaim production readiness.

| Validasi | Hasil aktual |
| --- | --- |
| npm.cmd test | PASS: 33 files, 547 tests |
| npm.cmd run test:browser -- --reporter=list | PASS: 120 tests, harness sintetis lokal |
| npm.cmd exec -- tsc --noEmit | PASS setelah tes final |
| npm.cmd run lint | PASS: 0 error, 2 warning lama no-img-element di src/app/page.tsx:54 dan :160 |
| npx.cmd prisma validate | PASS dengan URL proses localhost sintetis |
| npm.cmd run build | PASS: Next.js 16.4.6, 38/38 pages; endpoint/key proses sintetis localhost |
| git diff --check | PASS; sembilan berkas untracked juga diperiksa via diff --no-index --check sesuai konfigurasi CRLF repository |
| node scripts/stage3e1c-rehearsal.mjs --create-approved-synthetic | PASS: 14 tes baru, termasuk 22 submission parity dalam satu tes |
| Regresi PostgreSQL diwarisi | PASS: 43 tes service lama berprivilege, 33 assertion SQL Stage 2B.3, 16 tes keamanan Stage 3E.1, 17 tes Stage 3E.1B; tidak disamakan dengan acceptance runtime baru |

Log check umum disimpan di `.tmp/stage3e1c/`: unit.log, browser.log, tsc.log, lint.log, prisma.log, build.log. Unit/browser/build dijalankan sesudah perubahan service final; sesudah tambahan SQL/tes keamanan, tsc/lint/rehearsal diulang. Perubahan terakhir setelah run hanya perapian komentar/dokumentasi.

Riwayat kegagalan aktual: tsc awal menemukan tiga masalah tipe fixture/generic/BigInt dan diperbaiki tanpa perubahan bisnis. Rehearsal `16-21-15.587Z` menghasilkan 10/11 PASS; satu assertion salah mengharapkan exception ketika UPDATE completed answers ditolak RLS sebagai nol baris. Assertion diperbaiki untuk mewajibkan nol perubahan dan membandingkan seluruh jawaban persisted, bukan melonggarkan otorisasi. Run `16-23-26.855Z` 12/12 PASS, `16-25-08.048Z` 13/13 PASS, final 14/14 PASS setelah hardening search_path/tes shadowing. Pemeriksaan whitespace tambahan dengan autocrlf dimatikan sempat salah menandai CRLF; pemeriksaan ulang dengan konfigurasi repository lulus. Diagnostic P4002 lintas schema auth dari harness Stage 2B.3 tetap merupakan keterbatasan introspection yang sudah diketahui, bukan migrasi gagal; delapan checksum dan catalog diverifikasi.

Tidak ada pengujian yang gagal tersisa pada run final. Kelulusan tes yang mengharapkan penolakan finalizer tidak mengubah status artifact finalization BLOCKED.

## K. Blocker tersisa

Arsitektur least-privilege keseluruhan **PARTIAL**, bukan COMPLETE. Scoring/projection/aggregate lokal maju, tetapi private Storage finalization, worker/service principal terpisah, trusted signer custody/rotation, production DAL, full dashboard dan mutasi lintas pihak tetap belum selesai. Tidak ada kebijakan chat/lifecycle produksi yang diaktifkan.

Signer lokal memegang HMAC key dalam proses test; model ini tidak melindungi dari kompromi proses website/signer atau pemilik DB. Helper mengurangi kemampuan caller SQL untuk memalsukan totals namun tidak membuktikan kebenaran jawaban participant. Jawaban sesi sendiri sebelum completion memang input participant. Direct SQL dapat memicu operasi authorized miliknya atau denial-of-service; tidak ada klaim perlindungan absolut.

Formula SQL kini menjadi salinan terverifikasi dari mesin TS dan memerlukan parity/approval setiap perubahan. Fixture approval/licence seluruhnya sintetis, bukan bukti izin klinis/institusi. Uji performance, rotasi key, attestation replay/durability, audit worker, backup restore dan hosted Supabase belum dilakukan. Production submit lama masih memerlukan migrasi integrasi sebelum runtime least-privilege dapat dipakai.

## L. Berkas, Git dan rekomendasi

Branch akhir `riehand_branch`, HEAD `243cb9b`. Satu berkas tracked dimodifikasi: `src/lib/admin/service.ts` (+13 baris, fungsi opt-in terpisah). Sembilan berkas baru:

- `docs/PHASE3-STAGE3E1C-TRUSTED-WORKFLOWS.md`
- `docs/sql/stage3e1c/01-scoring.sql`
- `docs/sql/stage3e1c/02-projections.sql`
- `docs/sql/stage3e1c/03-report-boundary.sql`
- `scripts/stage3e1c-rehearsal.mjs`
- `scripts/stage3e1c-checks.mjs`
- `tests/rehearsal/stage3e1c-services.ts`
- `tests/rehearsal/stage3e1c.rehearsal.ts`
- `vitest.stage3e1c.rehearsal.config.ts`

Snapshot awal memuat untracked deliverable Stage 3E.1/3E.1B dan berkas pengguna `tatus`; semuanya dipertahankan. Hash 29 berkas baseline (20 deliverable, delapan migration.sql dan migration_lock.toml) dibandingkan kembali: 0 berubah. Tidak ada perubahan schema Prisma, shared Auth triggers, Flutter/chatbot, default privileges platform, env secrets, package version, atau route produksi. Semua SQL baru bertanda TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

Rekomendasi berikutnya: review gateway dan custody signer, rancang worker attestation/audit terpisah, lalu integrasikan production DAL dan transaksi booking/lifecycle secara bertahap dengan acceptance masing-masing. Jangan menggunakan credential deployer/owner sebagai runtime fallback. Tidak commit/push/merge/deploy. Berhenti setelah validasi untuk review pengguna.
