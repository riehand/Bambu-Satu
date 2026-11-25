# Stage 3E.1B â€” RLS dan runtime nonprivilege

## A. Baseline

22 November 2026, branch riehand_branch. Worktree awal: sepuluh deliverable Stage 3E.1 belum committed, ditambah `tatus` milik pengguna. Hash deliverable lama dan delapan migrasi disimpan di `.tmp/stage3e1b/preserved-before.json`; `tatus` tidak disentuh. Stage 3E.1 membuktikan koneksi dan isolation, tetapi profil NULL, start NO_ACTIVE_ACADEMIC_PERIOD, save/submit RESOURCE_NOT_FOUND, booking ASSESSMENT_REQUIRED, PDF REPORT_NOT_FOUND, admin/lifecycle/chat FORBIDDEN karena default-deny RLS. Semua pekerjaan tahap ini lokal sintetis; hosted **NOT EXECUTED**.

## B. Keputusan arsitektur sebelum implementasi

| Pilihan | Keputusan dan boundary |
| --- | --- |
| GUC actor_id + SET LOCAL | Tidak cukup: login runtime dapat memalsukan nilainya. Berguna hanya sebagai transport transaksi |
| Klaim bertanda tangan independen | Dipilih untuk prototipe: HMAC SHA-256 diverifikasi di DB, secret tidak dapat dibaca runtime. Subject berasal dari hasil server-side auth.getUser dengan email confirmed, bukan argument userId/role |
| SECURITY DEFINER | Dipakai terbatas untuk verifikasi signature/profil sendiri dan agregat operasional. Owner NOLOGIN/NOBYPASSRLS/non-owner tabel klinis, search_path tetap, tanpa dynamic SQL atau parameter identitas sewenang-wenang |
| JWT melalui PostgREST | Cocok bila seluruh akses melalui verifier PostgREST; Prisma 5.22 koneksi langsung tidak otomatis memverifikasi JWT atau mewarisi identitas Auth |
| JWT asymmetric langsung di PostgreSQL | Memerlukan verifier/JWKS rotation yang belum tersedia. Tidak menambahkan extension verifier pihak ketiga atau mengaku pgcrypto memvalidasi JWT Supabase |

HMAC ini **bukan JWT Supabase**. Trusted signer lokal hanya menerbitkan subject setelah autentikasi server; DB membaca role/is_active authoritative. Payload mengikat audience, subject, issued/expiry, backend PID, transaction ID dan purpose. Context SET LOCAL berakhir saat commit/rollback; token yang dicuri dari transaksi lain tidak berlaku pada PID/transaction berbeda. Semua query harus memakai transaction client yang sama. Pool reuse, reconnect, forged signature/subject/role/purpose dan raw SQL diuji.

Threat model: attacker memiliki credential SQL website_runtime dan dapat menjalankan SQL arbitrer, tetapi tidak menguasai signer, key store, deployment owner, Auth verifier atau proses Node. Full JavaScript/process compromise dapat mencuri HMAC key; pemisahan signer menjadi service/key custody terpisah diperlukan sebelum produksi. Tidak ada klaim perlindungan terhadap owner/superuser. Signature tidak menggantikan row policy atau validasi mutasi bisnis. Supabase Auth di rehearsal memakai respons sintetis, bukan validasi JWT hosted end-to-end.

Runtime prototype dan adapter berada di tests/rehearsal, tidak mengaktifkan production route atau policy. Integrasi produksi memerlukan boundary authentication/context eksplisit pada setiap route/DAL; tidak ada fallback ke postgres. SQL baru terpisah di docs/sql/stage3e1b. Helper tidak boleh memberikan akses tanpa signature valid. Operasi yang belum memiliki kontrak aman harus tetap ditolak dan dilaporkan sebagai blocker.

## C. Matriks RLS

**Hasil akhir: PARTIAL.** Arsitektur lokal meluluskan sebagian workflow dan tes penolakan; sepuluh workflow acceptance belum semuanya selesai. Tidak layak cutover produksi. PASS pada tes yang mengharapkan penolakan bukan PASS workflow tersebut.

| Objek | Akses website_runtime yang efektif |
| --- | --- |
| users | Profil aktif sendiri, sepuluh kolom non-password; UPDATE(id) untuk row lock, trigger menolak perubahan identitas |
| academic_periods | SELECT ACTIVE untuk participant; UPDATE(id) untuk FOR SHARE, WITH CHECK false menolak mutasi; INSERT dicabut |
| assessment_question_sets | SELECT published untuk participant |
| questions | SELECT active dari question set published untuk participant |
| assessment_sessions | SELECT/INSERT/UPDATE milik participant; constraint/trigger lama melindungi consent, kuota, completion dan completed immutability; guard baru membekukan id/started_at/created_at |
| assessment_answers | SELECT milik sendiri; INSERT/UPDATE hanya sesi IN_PROGRESS; guard identitas dan validasi jawaban lama tetap aktif |
| assessment_scores | SELECT milik sendiri; INSERT dicabut sampai ada verifikasi skor independen; UPDATE/DELETE tidak diberikan |
| reports | SELECT sendiri, INSERT PENDING tanpa artifact; UPDATE dicabut. Sharing psikolog belum diberikan |
| psychologist_profiles | SELECT/INSERT/UPDATE profil sendiri untuk PSYCHOLOGIST, kolom UPDATE mengikuti grant terbatas sebelumnya |
| psychologist_availability | SELECT/INSERT/UPDATE sendiri untuk PSYCHOLOGIST; BOOKED tidak dapat diubah atau dibuat langsung oleh runtime |
| appointments | SELECT participant pemilik atau psikolog yang ditugaskan; INSERT dicabut, tidak ada UPDATE policy |
| consultation_sessions | SELECT melalui appointment yang boleh dibaca; INSERT dicabut, tidak ada UPDATE policy |
| consents | SELECT pemilik/recipient sesuai role; INSERT dicabut, tidak ada UPDATE policy |
| consent_audit_events | SELECT audit consent participant sendiri; append/mutasi langsung tidak diberikan |
| consultation_messages | SELECT hanya kedua pihak melalui appointment/session IN_PROGRESS, kedua check-in, started, belum ended, dalam jendela waktu; INSERT dicabut, UPDATE/DELETE tidak diberikan |

RLS semua 15 tabel tetap aktif. Policy bukan pengganti ACL. Grant UPDATE untuk lock tetap memerlukan policy dan trigger pembatas; tidak disebut sebagai hak lock-only. Role admin runtime tidak mendapatkan SELECT baris klinis untuk memenuhi aggregate.

## D. SQL dan grant

Empat proposal baru, **TEST ONLY / HOSTED NOT EXECUTED**, dieksekusi hanya setelah guard database lokal dan marker rehearsal:

- `docs/sql/stage3e1b/01-identity.sql`: schema privat, pgcrypto/HMAC, key sintetis, role verifier NOLOGIN/NOBYPASSRLS, subject/role/profil sendiri. Runtime tidak dapat membaca key atau SET ROLE verifier. Klaim null ditolak eksplisit agar SQL three-valued logic tidak melewati pemeriksaan expiry.
- `docs/sql/stage3e1b/02-runtime-policies.sql`: policy per objek dan pencabutan grant mutasi yang belum mempunyai kontrak aman.
- `docs/sql/stage3e1b/03-mutation-guards.sql`: tambahan trigger SECURITY INVOKER untuk identitas profil/sesi/jawaban dan BOOKED. Tidak mengganti definisi trigger historis.
- `docs/sql/stage3e1b/04-monitor.sql`: helper agregat SECURITY DEFINER dengan owner khusus NOLOGIN/NOBYPASSRLS. Owner hanya memiliki SELECT kolom operasional users, assessment_sessions, appointments, di bawah policy SUPERADMIN. Output tetap enam field tanpa skor, jawaban, pesan, email, atau report. Maksimum 93 tanggal inklusif, WIB sesuai validasi aplikasi.

Semua helper memakai search_path tetap dan nama objek qualified; EXECUTE PUBLIC dicabut. Tidak ada parameter untuk menetapkan subject sewenang-wenang. Runtime tidak menjadi pemilik tabel atau anggota role lain. Tidak ada perubahan default ACL/platform roles baru pada proposal ini; harness lama membuat platform role sintetis untuk simulasi.

Dasar teknis: [RLS PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [HMAC pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html), dan [keamanan SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html). Owner/superuser tetap berada di luar threat model runtime.

## E. Integrasi Prisma

`tests/rehearsal/stage3e1b-context.ts` menggunakan Prisma **5.22.0** dengan koneksi nyata website_runtime, pool dua koneksi. `withVerifiedAuth` menerima hasil server-side getUser sintetis yang confirmed, kemudian AsyncLocalStorage membawa subject ke signer. Role tidak berasal dari metadata klien. Transaksi membaca PID/transaction ID/waktu DB, menandatangani klaim, memasang SET LOCAL, dan memeriksa profil aktif melalui DB.

Service produksi diuji tanpa mengubah implementasinya: vi.mock hanya mengganti singleton Prisma dengan adapter test. Callback `$transaction` tetap interactive transaction nyata, opsi isolation dipertahankan; query mandiri mendapat transaksi sendiri. Raw SQL yang memerlukan identitas melewati boundary sama. Array transaction ditolak eksplisit. Tidak ada flatten transaksi atau fallback owner bila query ditolak.

Owner hanya untuk provisioning, fixture, dan assertion independen. Role deployer hanya dipakai untuk migrasi clone lokal. Operasi sistem/background finalisasi report dan consent expiry **belum diotorisasi**: nilai purpose bertanda tangan sendiri tidak cukup membuktikan artifact atau tindakan sistem yang sah. Tidak ada wiring runtime/secret baru pada `src/` atau route produksi.

## F. Workflow acceptance

| # | Workflow | Bukti nonprivileged dan status |
| --- | --- | --- |
| 1 | Profil participant | **PASS lokal**: profil sendiri terbaca, profil participant lain NULL, missing/unconfirmed Auth ditolak; role aktif authoritative |
| 2 | Assessment start/save/submit/history | **PARTIAL**: service start, simpan 35 jawaban, history dan row lock lulus. Cross-user/forged actor/psikolog ditolak. Submit gagal pada INSERT assessment_scores dan seluruh transaksi rollback |
| 3 | Score/report generation metadata | **BLOCKED**: pembacaan skor/report existing hanya pemilik. INSERT skor dan UPDATE report GENERATED ditolak. Belum ada gateway verifikasi skor dan attestasi Storage; generation end-to-end tidak dihitung lulus |
| 4 | Profil/jadwal psikolog | **PASS lokal**: upsert profil, tiga slot harian, penolakan participant/psikolog lain, dan BOOKED tidak editable |
| 5 | Booking/atomic reservation | **BLOCKED**: dua percobaan service tidak menambah appointment. SELECT profil pihak lain tidak tersedia; UPDATE slot pihak lain dan INSERT appointment/session/consent belum diotorisasi. Ini membuktikan tidak ada partial mutation, bukan keberhasilan reservasi |
| 6 | Consent/revoke/expiry | **BLOCKED**: grant dan revoke consent aktif gagal; fixture aktif tetap revokedAt NULL. Revoked consent tidak dapat diaktifkan ulang lewat SQL; report recipient tetap tidak terlihat. Expiry mutation/system authorization belum diimplementasikan |
| 7 | PDF DB authorization | **PARTIAL**: service participant membaca metadata GENERATED miliknya; participant lain, psikolog tanpa jalur sharing aman, dan admin tidak membaca report/score. Consent-authorized sharing positif dan Storage belum lulus |
| 8 | Check-in/start/completion | **BLOCKED**: service start ditolak; UPDATE appointment/session dan akses profil counterpart belum tersedia. Check-in/completion positif serta seluruh kombinasi invalid-role belum didemonstrasikan |
| 9 | Chat send/retrieve | **BLOCKED**: send ditolak, outsider retrieval ditolak; SQL tidak mengembalikan pesan existing setelah expiry bagi kedua pihak, outsider, admin. Positive retrieval pada live session dan send end-to-end belum lulus |
| 10 | Admin monitoring | **PARTIAL**: helper aggregate terbatas menghasilkan jumlah participant aktif sesuai assertion owner, participant/psikolog ditolak. Service admin lama masih menghitung nol akibat RLS; belum dialihkan ke helper. Tidak dianggap selesai |

Penyebab blocker bukan konektivitas. SQL yang bergantung pada counterpart users memperoleh nol baris; hak INSERT scores/appointments/consents/messages dan UPDATE reports sengaja dicabut. Row lock consent/appointment/session tidak memperoleh row tanpa UPDATE policy; mutasi berikutnya tidak berhasil. Membuka SELECT users untuk memenuhi join akan ikut membuka email/telepon yang sudah memiliki column grant. Memberi INSERT scores biasa memungkinkan pemalsuan skor resmi lewat SQL langsung. Keduanya memerlukan desain DAL/projection/gateway yang direview, bukan policy role-wide.

## G. Pengujian negatif SQL langsung

17 tes baru mencakup:

- Missing context, Auth invalid/unconfirmed, query di luar verified request, profil inactive termasuk perubahan aktif di tengah request.
- Bare GUC user/role spoof; perubahan subject psikolog, purpose, exp, PID, transaction ID tanpa MAC sah.
- MAC sah dari signer fixture tetapi expiry lampau, issuance masa depan, audience salah, atau expiry JSON null: seluruhnya ditolak 42501.
- Key read, SET ROLE postgres/deployer/verifier/monitor, direct EXECUTE trigger helper yang tidak disetujui: ditolak 42501.
- Cross-participant profile/report/score, akses klinis admin, forged actor pada service assessment dan jadwal: ditolak atau kosong sesuai query.
- INSERT skor palsu, UPDATE GENERATED, UPDATE skor, DELETE audit: ditolak; users/answer identity rewrite ditolak.
- Reactivation revoked consent menghasilkan nol row updated; status persisted tetap revoked; recipient tidak membaca report.
- Pesan existing pada konsultasi kedaluwarsa tidak terlihat bagi participant/psikolog yang ditugaskan, participant lain, maupun admin.
- SELECT chatbot.messages, SELECT public._prisma_migrations dan UPDATE chatbot._backend_migrations: ditolak. Semua sentinel chatbot tetap sama.

Tes dengan `WHERE false` membuktikan ACL menolak statement bahkan tanpa row, bukan membuktikan row-policy mutasi pada data. Tes tambahan identitas/consent/BOOKED memakai row nyata sintetis. Matriks invalid-role lengkap untuk workflow yang belum bisa berjalan tetap merupakan gap, bukan klaim PASS.

## H. Concurrency dan pool

Dua koneksi dipakai ulang oleh 12 request concurrent dengan subject bergantian; setiap query hanya melihat identitas sendiri. Setelah rollback, GUC kosong; token dari transaksi lama ditolak setelah disconnect/reconnect. Fresh request setelah reconnect tetap berhasil.

Dua service saveAnswers dengan expectedRevision sama menghasilkan tepat satu success dan satu STALE_REVISION. INSERT availability diikuti key-read terlarang rollback: owner assertion menemukan nol slot tersisa. Submit yang diblokir mempertahankan sesi IN_PROGRESS/revision 1 tanpa score. Booking concurrent tetap diblokir tanpa mutasi; tidak mengklaim race reservation selesai.

## I. Bukti PostgreSQL aktual

Rehearsal final: `.tmp/phase3-rehearsal-2026-11-22T15-57-59.103Z/` (ignored, bukti lokal).

- Docker 28.5.1, PostgreSQL 17.11, Prisma 5.22.0.
- Image digest `sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`.
- Container `wellbeing-phase3-77504dd5eb`, volume `wellbeing-phase3-77504dd5eb-data`, endpoint `127.0.0.1:57878`, database `wellbeing_phase3_rehearsal`.
- Delapan migrasi lengkap/checksum lulus; deployer clone menerapkan enam migrasi setelah dua baseline Auth dan berikutnya no pending migrations.
- Regresi inherited: 43 tes PostgreSQL service lama, 33 assertion SQL Stage 2B.3, 16 tes keamanan Stage 3E.1. Tes baru Stage 3E.1B: **17/17 PASS**.
- `stage3e1b-checks.jsonl`, `stage3e1b-catalog.log`, `stage3e1b-result.json` merekam boundary, policy, ACL/helper owner dan **runtimeAcceptance PARTIAL**. `result.json` PASS_SYNTHETIC_POSTGRESQL_ONLY tidak berarti semua workflow runtime lulus.
- Harness memverifikasi marker/token container, menolak endpoint hosted, membersihkan environment child, kemudian menghentikan container miliknya; volume bukti dipertahankan. Tidak menyalin production data.

Kegagalan selama pengembangan tetap dicatat: run `06-03-12.659Z` memiliki 5/14 kegagalan akibat trigger lintas tabel dan tanggal admin; run `15-53-35.179Z` berhenti pada docker-locality saat engine tidak tersedia; run `15-55-00.300Z` memiliki 1/14 kegagalan karena fixture consent sudah revoked dan service mengembalikan hasil idempoten. Trigger, rentang tanggal, dan fixture aktif diperbaiki; run `15-56-38.120Z` 16/16 lulus; run final menambah tes expiry menjadi 17/17.

Keterbatasan introspection P4002 lintas schema auth yang sudah tercatat Stage 2B.3 tetap muncul sebagai expected diagnostic harness; checksum/catalog menjadi bukti migrasi. Tidak ada verifikasi JWT Supabase hosted, Storage integration, atau backup restore pada tahap ini.

## J. Regresi penuh

| Perintah | Hasil aktual |
| --- | --- |
| npm.cmd test | PASS, 33 files / 547 tests |
| npm.cmd run test:browser -- --reporter=list | PASS, 120 tests, harness sintetis lokal |
| npm.cmd exec -- tsc --noEmit | PASS, termasuk tes baru final |
| npm.cmd run lint | PASS, 0 error; 2 warning lama no-img-element pada src/app/page.tsx:54 dan :160 |
| npx.cmd prisma validate | PASS, URL proses di-override localhost sintetis |
| npm.cmd run build | PASS, environment proses menggunakan URL/key sintetis localhost |
| git diff --check | PASS; karena perubahan baru untracked, juga diperiksa whitespace dengan diff --no-index |
| node scripts/stage3e1b-rehearsal.mjs --create-approved-synthetic | PASS tes lokal; acceptance runtime PARTIAL |

Log regresi tersedia di `.tmp/stage3e1b/`: unit.log, browser.log, tsc.log, lint.log, prisma.log, build.log. Unit/browser/build dilaksanakan pada tahap ini; perubahan setelahnya hanya SQL/tes rehearsal, kemudian tsc/lint/rehearsal dijalankan ulang. Tidak ada package upgrade atau perubahan source aplikasi.

## K. Batas keamanan dan blocker produksi

**PARTIAL**, bukan COMPLETE. Runtime lokal tidak dapat memalsukan signed context hanya melalui credential SQL, dengan asumsi signer/key/owner tidak dikuasai. Proses Node prototype memegang HMAC key; compromise proses dapat memalsukan identitas. Key rotation, custody service terpisah, audit signer, autentikasi hosted nyata, serta performance/load testing belum dibuktikan. Verifikasi HMAC/role berulang per row dapat mahal; perlu benchmark sebelum optimasi, jangan cache identitas lintas transaksi.

Belum tersedia: validasi skor independen untuk mencegah official-score forgery; artifact attestation dan identity sistem terbatas; projection counterpart tanpa private contact; gateway atomic booking/consent/lifecycle/chat yang memvalidasi seluruh invariant; wiring DAL produksi dan aggregate admin. Background purpose belum memberikan hak write. Signed identity hanya mengikat actor, bukan membuktikan bahwa operasi berasal dari service method yang benar.

Tidak mengklaim kebal terhadap arbitrary JavaScript, table owner, superuser, signer compromise, side-channel, atau seluruh bentuk SQL denial-of-service. Constraint unik/FK dan error masih dapat memberi sinyal keberadaan; model perlu review sebelum produksi. Prototype belum audit seluruh business invariant arbitrary SQL pada operasi milik sendiri. Batas ini tidak diselesaikan dengan memperluas grant.

## L. Git dan langkah berikutnya

Branch tetap `riehand_branch`, HEAD `243cb9b`. Tidak commit/push/merge/deploy. Tidak mengubah Prisma schema, delapan migrasi, src, packages, secrets, Stage 2B.3 SQL, atau deliverable Stage 3E.1. Snapshot 18 berkas (10 deliverable lama + 8 migrasi) dibandingkan kembali: **0 berubah**. Berkas pengguna `tatus` tetap tidak disentuh.

Sepuluh berkas baru Stage 3E.1B, semuanya untracked:

1. docs/PHASE3-STAGE3E1B-RLS-RUNTIME.md
2. docs/sql/stage3e1b/01-identity.sql
3. docs/sql/stage3e1b/02-runtime-policies.sql
4. docs/sql/stage3e1b/03-mutation-guards.sql
5. docs/sql/stage3e1b/04-monitor.sql
6. scripts/stage3e1b-rehearsal.mjs
7. scripts/stage3e1b-checks.mjs
8. tests/rehearsal/stage3e1b-context.ts
9. tests/rehearsal/stage3e1b.rehearsal.ts
10. vitest.stage3e1b.rehearsal.config.ts

`git diff --stat` tracked kosong karena seluruh deliverable baru masih untracked; bukan berarti tidak ada perubahan. Status akhir memuat berkas baru di atas dan seluruh untracked baseline Stage 3E.1/tatus. Bukti hash/status awal berada di `.tmp/stage3e1b/`.

Rekomendasi review berikutnya: putuskan custody signer dan kontrak gateway skor/artifact; rancang projection counterpart serta transaksi lintas pihak; integrasikan DAL dan aggregate admin, lalu ulangi seluruh sepuluh workflow dan matriks negatif sebelum cutover. Semua proposal hosted **NOT EXECUTED**, memerlukan persetujuan eksplisit terpisah. Implementasi lokal dan validasi tahap ini berhenti untuk review.
