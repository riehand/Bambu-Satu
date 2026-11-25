# Phase 3 — Stage 3E.1: Least-Privilege Database Security

22 November 2026, Asia/Jakarta. Repository `riehand/Bambu-Satu`, branch `riehand_branch`, HEAD awal `243cb9b`.

**Status runtime least-privilege: INCOMPLETE.** Koneksi runtime nyata tanpa SUPERUSER/BYPASSRLS berhasil dibuat dan isolasi objek diuji, tetapi workflow aplikasi gagal karena belum ada policy/otorisasi RLS untuk role tersebut. Ini bukan konfigurasi siap cutover. Deployer terpisah berhasil menerapkan enam migrasi pending pada baseline sintetis dua migrasi. Semua perubahan dan pengujian database dilakukan pada PostgreSQL lokal baru; **hosted: NOT EXECUTED**.

## A. Baseline dan batas pemeriksaan

Baseline hosted berikut berasal dari permintaan pemilik dan laporan sebelumnya, **bukan inspeksi hosted baru**: dua migrasi applied, enam pending; grant browser pada ledger berlebihan; public exposed melalui Data API, chatbot tidak exposed, automatic exposure enabled; bucket PDF belum dikonfigurasi; runtime berprivilege; default grant service_role berisiko. Tidak ada koneksi hosted, perubahan Dashboard/secret, pembacaan data Flutter nyata, commit, push, merge atau deployment dalam tahap ini.

AGENTS.md, panduan Next lokal `data-security.md`, schema dan delapan migration SQL, laporan Phase 2/Stage 2B.3/3A/3B/3C/3D, kontrak Chatbot, SQL ledger lama, harness Docker serta layanan auth/assessment/psychologist/appointment/consultation/chat/admin diperiksa. Referensi skill Prisma Client dipakai untuk pola query/transaksi; proyek tetap Prisma **5.22.0**, tanpa mengadopsi adapter/API Prisma 7 dalam contoh skill.

Worktree awal hanya memuat untracked `tatus`; tidak disentuh. Hash berkas itu tidak dapat dibaca karena sedang dikunci proses lain, sehingga tidak ada klaim verifikasi byte-identik untuk berkas tersebut. Delapan migration SQL berhasil di-hash sebelum/sesudah dan semuanya tetap sama. Schema, migrasi historis, SQL Stage 2B.3, package/lockfile, Auth triggers dan source bisnis tidak diedit.

Rehearsal memperluas harness lama: Docker endpoint lokal, image PostgreSQL terverifikasi, container/volume baru berlabel token, port ephemeral hanya `127.0.0.1`, environment hosted disingkirkan, marker database diperiksa. Database kedua `wellbeing_stage3e1_deployer` adalah clone lokal dari baseline dua migrasi pada invocation yang sama, dibuat sebelum enam migrasi berikutnya. Tidak berasal dari dump atau database existing. Role LOGIN/password acak hanya di container ini; proposal SQL tidak berisi password/key/connection string.

## B. Matriks privilege objek dan role

Matriks berikut adalah **hasil/desain sintetis setelah proposal diterapkan**, bukan keadaan hosted. `S/I/U/D` berarti SELECT/INSERT/UPDATE/DELETE pada ACL. Hak ACL tidak berarti row terlihat: seluruh 15 tabel website selain ledger memiliki RLS aktif. Hanya users memiliki policy SELECT untuk authenticated; tidak ada policy runtime.

| Objek public | anon | authenticated | website_runtime | website_deployer | flutter_runtime | service_role setelah revoke |
| --- | --- | --- | --- | --- | --- | --- |
| users | Tidak | S 10 kolom, own active row | S 10 kolom; U(id); **0 row** | REFERENCES(id), bukan owner | Tidak | Tidak |
| _prisma_migrations | Tidak | Tidak | Tidak | S/I/U/D | Tidak | Tidak |
| academic_periods | Tidak | Tidak | S/I; U(id), default-deny | Owner pada clone | Tidak | Tidak |
| assessment_question_sets | Tidak | Tidak | S, default-deny | Owner pada clone | Tidak | Tidak |
| questions | Tidak | Tidak | S, default-deny | Owner pada clone | Tidak | Tidak |
| assessment_sessions | Tidak | Tidak | S/I/U, default-deny | Owner pada clone | Tidak | Tidak |
| assessment_answers | Tidak | Tidak | S/I/U, default-deny | Owner pada clone | Tidak | Tidak |
| assessment_scores | Tidak | Tidak | S/I, default-deny | Owner pada clone | Tidak | Tidak |
| reports | Tidak | Tidak | S/I/U, default-deny | Owner pada clone | Tidak | Tidak |
| psychologist_profiles | Tidak | Tidak | S/I; U 9 kolom profil, default-deny | Owner pada clone | Tidak | Tidak |
| psychologist_availability | Tidak | Tidak | S/I/U, default-deny | Owner pada clone | Tidak | Tidak |
| appointments | Tidak | Tidak | S/I/U, default-deny | Owner pada clone | Tidak | Tidak |
| consultation_sessions | Tidak | Tidak | S/I/U, default-deny | Owner pada clone | Tidak | Tidak |
| consents | Tidak | Tidak | S/I; U(revoked_at,expired_at), default-deny | Owner pada clone | Tidak | Tidak |
| consent_audit_events | Tidak | Tidak | S/I, default-deny | Owner pada clone | Tidak | Tidak |
| consultation_messages | Tidak | Tidak | S/I, default-deny dan trigger guard | Owner pada clone | Tidak | Tidak |

Tidak ada grant runtime DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN atau mutasi skor/audit. `password_hash`, role dan is_active tidak dapat ditulis runtime. Grant UPDATE(id) bukan kemampuan lock-only: sebelum policy write diperkenalkan, immutability identitas tetap harus dirancang. Kolom profil yang dapat diupdate: professional_title, qualification, education, short_bio, areas_of_focus, consultation_method, consultation_location, languages, updated_at.

| Boundary | Browser | Website runtime | Deployer | Flutter runtime | service_role / owner |
| --- | --- | --- | --- | --- | --- |
| Schema public | USAGE, tanpa CREATE | USAGE, CREATE ditolak | USAGE/CREATE | USAGE bawaan PUBLIC, tanpa CREATE | service_role USAGE bawaan; owner mengelola objek |
| Schema auth | Browser fixture USAGE/auth.uid; tanpa table users | Tidak | Tidak | Tidak | Platform owner saja dalam fixture |
| Schema chatbot | Tidak | Tidak | Tidak | USAGE; S/I/U/D messages, user_memories, safety_events; S ledger sendiri | postgres owner sintetis; service_role tidak diberi USAGE |
| Ledger website | Tidak | Tidak | S/I/U/D | Tidak | service_role dicabut; postgres owner |
| Ledger chatbot | Tidak | Tidak | Tidak | Read-only, tanpa write | Owner chatbot/platform pada fixture |
| Function website | EXECUTE privat ditolak | Ditolak | Fungsi baru miliknya di clone | Ditolak | service_role dicabut; owner tetap berwenang |
| Sequence | Tidak ada sequence public website | Tidak perlu grant | UUID Prisma, bukan sequence | Fixture integer eksplisit | Inventory tetap memeriksa sequence jika hosted berbeda |
| BYPASSRLS/SUPERUSER | Tidak | Keduanya false | Keduanya false; **owner bypass tetap ada** | Keduanya false | service_role BYPASSRLS; postgres lokal SUPERUSER |
| Membership / SET ROLE | Tidak menuju deployer | Tidak ada inheritance/SET path | Tidak ada membership | Tidak ada membership | Role managed hosted belum diuji |
| Storage | Tidak diuji di PostgreSQL ini | PostgreSQL role tidak membatasi secret Storage | Bukan identitas runtime Storage | Tidak diberikan sharing PDF | Secret yang resolve ke service_role tetap berprivilege |

`CONNECT` dan `TEMPORARY` masih dapat berasal dari PUBLIC default database PostgreSQL lokal; tidak dicabut global pada shared platform. Runtime tidak punya database CREATE/schema public CREATE atau ownership objek website. Temporary schema bukan schema aplikasi permanen. Pemilik perlu mereview default database privileges hosted dalam preflight, termasuk risiko shadowing nama. Dua fungsi Auth SECURITY DEFINER menggunakan search_path kosong dan nama qualified; fungsi bisnis lainnya SECURITY INVOKER dengan search_path yang tercatat. Fungsi chat memiliki BEFORE trigger dan deferred constraint trigger pada commit. Definisi, owner, search_path, flag SECURITY DEFINER dan trigger Auth dipertahankan.

`01-preflight.sql` mengeluarkan matriks efektif per tabel/kolom/sequence/function/schema, role flags, semua membership INHERIT/SET, default ACL per creator, policy, trigger dan FK lintas-schema. Jangan menyimpulkan isolasi hanya dari ACL eksplisit: PUBLIC, ownership dan role yang dapat di-SET juga dihitung.

## C. Website runtime dan blocker fungsional

Role kandidat `website_runtime`: NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOINHERIT, non-owner, tanpa membership. Proposal membuatnya NOLOGIN; harness lokal memberi LOGIN dengan password acak untuk membuktikan `session_user=current_user=website_runtime` melalui koneksi TCP Prisma, bukan sekadar SET ROLE di koneksi postgres.

| Kebutuhan aplikasi | Bukti dengan runtime kandidat | Penyebab/pekerjaan tersisa |
| --- | --- | --- |
| Auth profile verified user | findUnique mengembalikan NULL | getUser diverifikasi aplikasi, tetapi konteks itu tidak dipasang/diverifikasi di DB; policy existing hanya authenticated |
| Start assessment | NO_ACTIVE_ACADEMIC_PERIOD | RLS menyembunyikan periode ACTIVE, meskipun row ada pada koneksi owner |
| Save answers / submit | RESOURCE_NOT_FOUND | Session/answers tidak terlihat; belum dapat mencapai persist skor/PENDING report |
| Report INSERT langsung | SQLSTATE 42501 | RLS WITH CHECK default-deny |
| Profil psikolog / availability | Read NULL/kosong; INSERT ditolak row-level security | Tidak ada policy own-profile/own-slot; rollback tanpa partial rows |
| FOR UPDATE/FOR SHARE | Query diizinkan ACL tetapi 0 row | UPDATE kolom dan SELECT cukup untuk sintaks lock, tetapi row tidak terlihat/terkunci |
| Booking konkuren | Kedua request ASSESSMENT_REQUIRED | Tidak mencapai perebutan slot; bukan bukti booking sukses di runtime baru |
| Grant consent / PDF | APPOINTMENT_NOT_FOUND / REPORT_NOT_FOUND | Scope RLS dan mekanisme authorized consent belum dirancang |
| Lifecycle / send-end konkuren | FORBIDDEN, tidak ada partial mutation | Profil aktor tidak terlihat; tidak mencapai state transition |
| Direct chat insert | 23514, ERROR: CHAT_WINDOW_CLOSED | BEFORE invoker trigger tidak melihat appointment melalui RLS; berjalan sebelum WITH CHECK |
| Super Admin overview | FORBIDDEN | Profil admin tidak terlihat; agregat operasional belum dapat dijalankan |

Workflow positive assessment start/save/submit, booking satu-pemenang, consent expiry/recheck PDF, lifecycle, deferred chat commit/send-end, admin aggregates dan rollback tetap lulus pada **43 tes regresi postgres berprivilege**. Hasil tersebut tidak menutup blocker runtime. Tidak ada policy USING(true), penonaktifan RLS, pemberian BYPASSRLS atau pelonggaran assertion bisnis untuk membuatnya terlihat lulus.

Arsitektur lanjutan memerlukan mekanisme request-scoped yang dipercaya. Saat ini singleton Prisma menerima connection role yang sama untuk semua aktor; auth/ownership/consent ditentukan layanan aplikasi. Mengisi `request.jwt.claim.sub` atau GUC actor_id saja tidak memberi attestasi: tes membuktikan login biasa dapat set nilai itu. Bila policy mempercayainya tanpa verifikasi, kredensial runtime/SQL injection dapat menyamar sebagai pengguna lain. Dengan desain itu, boundary identitas tetap **application-only**.

Pilihan yang harus direview: broker/entrypoint DB terbatas yang memvalidasi bukti identitas bertanda tangan (issuer/audience/expiry/revocation), atau mediator terpisah dengan role yang tidak dapat ditiru runtime. Bind identitas ke transaksi yang sama, gunakan SET LOCAL untuk konteks terverifikasi, dan uji pool reuse/rollback/concurrency. Policy perlu menangani own participant rows, counterpart psychologist aktif, consent spesifik report/appointment dan expiry, immutable scores/audit, serta admin aggregates tanpa akses hasil individu. Helper SECURITY DEFINER baru harus memakai owner terbatas, fixed search_path, allowlist input dan EXECUTE minimal. Tidak ada helper/policy baru seperti itu diaktifkan dalam tahap ini; desain dan pengujian end-to-end masih diperlukan.

## D. Migration deployer

`website_deployer` terpisah dari runtime dan browser; non-superuser/non-BYPASSRLS/non-CREATEDB/non-CREATEROLE. Pada clone dua migrasi: USAGE/CREATE public, S/I/U/D ledger, REFERENCES(id) users. Enam pending migration berhasil melalui **Prisma migrate deploy dengan kredensial deployer itu sendiri**; migrate status mengenali delapan migrasi. C4 dapat ALTER psychologist_profiles karena tabel tersebut dibuat oleh deployer pada migrasi pending sebelumnya.

Deployer memiliki 14 tabel baru dan fungsi/enums baru pada clone. public.users, Role/UserType, ledger dan fungsi/trigger Auth awal tetap milik postgres sintetis. Deployer tidak mendapat schema auth/chatbot atau SELECT users. Tidak diperlukan transfer ownership, REASSIGN OWNED, membership platform, migrate reset atau db push. Dua migrasi Auth awal merupakan prasyarat platform; hasil ini tidak berarti role ini dapat mengelola seluruh objek Auth atau melakukan bootstrap Supabase dari nol.

NOBYPASSRLS bukan batas bagi owner tabel: tes INSERT/read academic_period oleh deployer berhasil tanpa policy, lalu transaksi sengaja dibatalkan. Karena itu kredensial deployer hanya untuk job migrasi terkontrol dan tidak boleh dipasang di aplikasi. Proposal ACL untuk mixed ownership memerlukan sesi administrator yang memang berwenang atas kedua owner; script tidak memberikan membership untuk melewati guard.

## E. service_role dan default grants

Baseline utama mereproduksi default grant postgres dari harness lama. Koneksi login service_role lokal benar-benar dapat membaca count assessment sessions/answers/scores/reports, appointments, consultation sessions, consents, audit dan ledger. Migrasi chat kedelapan sudah menolak service_role. EXECUTE fungsi Auth juga masih efektif sebelum hardening. Ini observasi fixture, bukan bukti eksploitasi hosted/Data API.

Proposal 03 mencabut grant hanya pada 16 tabel dan 10 fungsi website bernama, termasuk grant kolom tersendiri. PUBLIC/browser pada tabel privat turut diperiksa; own-profile authenticated users dipertahankan. Sesudahnya service_role dan Flutter ditolak pada seluruh tabel tersebut. BYPASSRLS tidak mengabaikan object/schema ACL. Owner tetap memiliki kewenangan intrinsik; runtime/deployer tidak boleh disamakan.

Default grants berlaku saat objek dibuat dan bergantung pada creator. Semua pg_default_acl lama dipastikan tidak berubah. Enam migrasi yang dibuat sebagai deployer di clone tidak mewarisi default postgres; tabel baru itu tidak otomatis memberi service_role akses. Pembuatan objek berikutnya sebagai postgres masih dapat mengembalikan exposure. Karena itu pipeline harus meninjau ACL setiap objek baru, bukan hanya sekali revoke. Tidak ada ALTER ROLE managed atau perubahan default grant global pada proposal.

Tes menyuntikkan inheritance dan jalur SET-only secara lokal: proposal menolak keduanya dan membatalkan revoke ledger yang sudah dilakukan dalam transaksi. Table REVOKE saja tidak cukup untuk grant kolom; SELECT(checksum)/UPDATE(logs) diuji terpisah. SQL tidak memakai CASCADE untuk menebak rantai grant.

Secret Supabase yang berbeda tetapi resolve ke service_role tidak menciptakan isolasi database. Storage credential website masih merupakan jalur berprivilege terpisah dari Prisma role; custody, scope, kemungkinan broker Storage dan rotasi harus direview bersama Flutter. Tidak ada bucket/policy Storage atau private report artifact nyata yang diuji dalam eksperimen PostgreSQL ini.

Semantik mengacu pada dokumentasi PostgreSQL 17: [RLS dan owner bypass](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [INHERIT versus SET](https://www.postgresql.org/docs/17/role-membership.html), [default privileges per creator](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html), dan [SECURITY DEFINER/search_path](https://www.postgresql.org/docs/17/sql-createfunction.html).

## F. Isolasi Flutter

Hanya padanan sintetis `_backend_migrations`, chat_sessions, checkins, messages, safety_events, user_memories yang dipakai. Role baru Flutter diberi operasi pada tiga objek yang diperlukan eksperimen dan read-only ledger sendiri. Ini bukan penetapan kontrak operasi Flutter produksi. Role probe lama chatbot_runtime milik harness tetap tidak diubah.

Runtime website/deployer ditolak membaca chatbot messages/memories/safety events/ledger. Flutter ditolak membaca website scores/reports/consent/chat maupun menulis ledger website. Kedua runtime tidak bisa memutasi ledger pihak lain; Flutter baru juga tidak bisa menulis ledger sendiri. INSERT Flutter pada messages lalu akses website yang dilarang membatalkan seluruh transaksi; sentinel semula tetap utuh.

Pada clone deployer, katalog chatbot termasuk OID/owner/ACL/RLS, sentinel dan ledger tetap identik sesudah enam migrasi website; role Flutter baru tidak diberi grant chatbot pada clone itu. Pada database utama, hanya grant Flutter sintetis yang sengaja ditambahkan; katalog non-ACL/data tetap sama. Shared UUID auth.users/public.users kompatibel: trigger signup tetap menghasilkan PARTICIPANT meskipun metadata meminta SUPERADMIN, email sync tetap bekerja, authenticated dapat membaca profil sendiri tanpa password_hash. Signup Flutter tetap wajib memenuhi metadata institusi yang sudah ditetapkan kontrak; tidak ada perubahan trigger untuk mempermudah tes.

Fixture auth.users/auth.uid bukan Supabase GoTrue/Auth/JWT/PostgREST/pooler lengkap. Ia tidak membuktikan login/confirmation/email delivery, validasi JWT hosted, Storage atau Data API route exposure. Jika backend Flutter masih memegang postgres/service_role yang memiliki grant lintas objek, role flutter_runtime baru tidak otomatis menghapus akses credential lama. Custody dan cutover bersama tetap blocker.

## G. SQL proposal dan approval gates

Semua berkas di `docs/sql/stage3e1/`, terpisah dari historical migrations/SQL Stage 2B.3:

| Berkas | Isi dan gate |
| --- | --- |
| 01-preflight.sql | READ ONLY; metadata/ACL/policy/role/ledger checksum. Hosted perlu persetujuan preflight tersendiri |
| 02-role-proposal.sql | Role NOLOGIN baru, grant deployer minimal; marker reviewed-new-dedicated-roles; nama existing menyebabkan gagal |
| 03-object-privileges.sql | Allowlist tabel/fungsi, owner/grantor guards, table+column revoke, inheritance/SET check, kandidat runtime ACL; marker reviewed-exact-website-objects |
| 04-verification.sql | READ ONLY; effective access, ownership/RLS, schema/role paths dan ledger; flags harus diinterpretasikan sesuai matriks |
| 05-recovery.sql | Recovery khusus ledger deployer; marker reviewed-deployer-ledger-only; menolak deployer yang terjangkau browser/runtime/service |

Marker non-secret adalah guard kesalahan operator, **bukan pengganti otorisasi institusi/pemilik DB/Flutter**. Semua hosted changes berlabel NOT EXECUTED. Role creation dan SQL mutation baru hanya dijalankan pada database sintetis. SQL 03 tidak cukup untuk cutover runtime; tidak ada policy row authorization di dalamnya. Pada hosted dengan owner/grantor/membership berbeda, hentikan dan review scoped proposal, jangan memberi superuser/membership agar guard lolos.

## H. Bukti PostgreSQL aktual

Reproduksi dari workspace dengan Docker lokal:

```powershell
node scripts/stage3e1-rehearsal.mjs
node scripts/stage3e1-rehearsal.mjs --create-approved-synthetic
```

Tanpa flag hanya pesan persiapan, tanpa database. Container invocation dihentikan di finally; container final `wellbeing-phase3-02295b0aa4` diverifikasi **exited**. Volume/evidence lokal dipertahankan. Guard lama tidak diubah. Wrapper memverifikasi anchor source agar perubahan harness memerlukan review.

Run final: `.tmp/phase3-rehearsal-2026-11-22T04-21-40.568Z/`, selesai 11:22:31 WIB. PostgreSQL 17.11, Prisma 5.22.0, Docker 28.5.1; image digest `postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`. Bukti meliputi isolation.json, result.json, execution.log, operations.jsonl, checks.jsonl, stage2b3-checks.log, stage3a/b/c-checks.jsonl, stage3e1-checks.jsonl, preflight/postflight/verifikasi, deployer log/catalog dan stage3e1-result.json.

- **43 tes PostgreSQL workflow existing**: Phase 3 6 + Stage 3A 12 + Stage 3B 15 + Stage 3C 10. Semua memakai postgres berprivilege; kategori ini tetap terpisah.
- **16 tes keamanan baru**: checksum kedua DB; login/atribut/membership nyata; service_role sebelum/sesudah; approval/INHERIT/SET rollback; grant kolom; profile Auth; function boundary; Flutter isolation/rollback; default-deny reads/locks; blocker workflow aplikasi; race yang ditolak tanpa partial write; profile/availability; INSERT guard; deployer ownership/preservation; recovery ledger; constraint/chatbot preservation.
- **33 pemeriksaan SQL Stage 2B.3** diulang, mencakup C4 dan ledger; beberapa memang menandai risiko baseline sebelum hardening Stage 3E.1.
- Delapan checksum cocok dengan ledger di **dua database**; tidak ada migrasi diedit. Existing constraint/profile/Auth trigger dan chatbot preservation diperiksa. Deployer menjalankan enam pending migration, lalu status/deploy no-op setelah hardening.

Percobaan pertama berhenti pada Docker engine yang belum berjalan, sebelum database dibuat. Docker Desktop lokal kemudian dinyalakan. Percobaan berikutnya 14/15 tes keamanan lulus; ekspektasi chat INSERT keliru menganggap 42501, padahal BEFORE trigger menolak 23514. Setelah penambahan profile/availability, percobaan berikutnya 15/16 lulus karena pesan Prisma menyertakan prefix `ERROR:`. Ekspektasi diperbaiki ke SQLSTATE dan pesan yang tepat; tidak mengubah kode bisnis/trigger atau mengizinkan request yang sebelumnya ditolak. Run final mengulang keseluruhan rangkaian.

Prisma migrate diff tetap memiliki batas lama P4002 atas FK public.users → auth.users pada datasource single-schema. Harness menangkap batas itu; tidak menghapus FK, menambah model Auth atau memakai hasil diff sebagai migrasi. Tidak ada restore backup, test pooler, atau acceptance Supabase penuh.

## I. Regresi penuh aktual

| Perintah | Hasil Stage 3E.1 |
| --- | --- |
| npm.cmd test | PASS 547/547, 33 file |
| npm.cmd run test:browser -- --reporter=list | PASS 120/120, harness localhost/API sintetis |
| npm.cmd exec -- tsc --noEmit | PASS exit 0 |
| npm.cmd run lint | PASS exit 0, dua warning no-img-element existing pada src/app/page.tsx |
| npx.cmd prisma validate | PASS, URL proses ditimpa localhost sintetis, tanpa koneksi DB |
| npm.cmd run build | PASS Next 16.4.6, TypeScript dan 38 halaman; endpoint proses localhost sintetis |
| node scripts/stage3e1-rehearsal.mjs --create-approved-synthetic | 43 workflow postgres + 16 security tests + 33 SQL checks; runtime workflow INCOMPLETE |
| git diff --check | PASS exit 0; sepuluh untracked deliverable juga lulus whitespace check melalui diff --no-index |

Log regresi di `.tmp/stage3e1/`. Browser/unit memakai mock/synthetic API dan PGlite sesuai harness existing. Build dapat membaca konfigurasi .env oleh tool, tetapi variabel DB/Supabase proses ditimpa nilai sintetis; file secret tidak dibaca ke output atau diubah. Tidak mengulang npm audit/17 HTTP smoke Stage 3D dan tidak menyebut angka tersebut sebagai hasil baru. Advisory tooling yang dilaporkan Stage 3D tetap pekerjaan terpisah; tidak ada upgrade paket.

## J. Risiko belum terselesaikan

1. Runtime row authorization belum tersedia; runtime baru belum layak digunakan aplikasi. Guard default-deny lulus bukan acceptance workflow.
2. Credential runtime existing dan secret Storage masih jalur istimewa; isolasi memerlukan custody/rotation/cutover, bukan hanya membuat role.
3. Deployer adalah owner objek baru dan dapat melewati RLS objeknya. Simpan hanya pada job migrasi yang diserialisasi, jangan pada web/Flutter runtime.
4. Default ACL postgres tidak diubah; objek baru buatan owner itu dapat terekspos kembali. Public Data API/automatic exposure belum diverifikasi baru atau diubah.
5. Full Auth/Storage/PostgREST/pooler, load, backup/restore dan UAT kedua aplikasi belum diuji. Synthetic Flutter schema tidak membuktikan seluruh query Flutter nyata kompatibel.
6. Lock privilege UPDATE(id), policy immutable data, agregat admin dan helper request authorization memerlukan desain lanjutan. Jangan menggantinya dengan USING(true) atau broad UPDATE role/is_active.
7. Persetujuan kebijakan institusi untuk lifecycle/chat/period/provisioning, retensi dan disclosure tetap berlaku; tidak ada fitur produksi diaktifkan.

## K. Urutan rollout terkendali — planning only

1. Institusi menunjuk data/security owner; website/Flutter/platform menyepakati object ownership, identitas bersama, operasi masing-masing dan ledger terpisah. Dokumentasikan approver, SQL checksum, window, RTO/RPO serta komunikasi insiden. Persetujuan ketiganya wajib sebelum shared change.
2. Selesaikan trusted request-scoped authorization dan scoped RLS; ulangi positive/negative/concurrency workflows memakai runtime non-owner yang sebenarnya. Luluskan pooled-connection leakage, forged context, consent revoke/expiry dan admin minimum disclosure sebelum mengizinkan cutover.
3. Tentukan custodian credential terpisah: migrasi di release secret store, web/Flutter runtime terpisah, Storage service credential dengan akses terbatas. Siapkan rotasi tanpa mencatat key, audit akses secret dan pencabutan credential lama sesudah rollback window disepakati.
4. Ambil backup yang disetujui pemilik; restore ke target baru yang terisolasi, verifikasi checksum/data integrity, shared identities, kedua aplikasi dan waktu recovery. Rehearsal ini belum memenuhi gate backup/restore.
5. Dengan izin read-only hosted tersendiri, jalankan preflight, cek versi/owner/grantor/column ACL/SET paths/default creator/FK serta Data API/Storage secara terkoordinasi. Jangan mutation probe pada ledger hosted. Rekonsiliasi actual baseline dan C4 invalid rows tanpa menghapus data.
6. Pada maintenance window, serialisasi migrasi kedua tim dan batasi jalur akses yang belum aman. Persiapkan role NOLOGIN/custody deployer; harden ledger dengan grant deployer tetap tersedia. Terapkan enam pending migration sebagai deployer yang disetujui. Review ACL setiap objek sebelum membuka traffic/Data API, khususnya bila creator/default ACL hosted berbeda. Eksekusi privilege proposal hanya oleh sesi owner berwenang, kemudian verifikasi efektif termasuk kolom/SET paths.
7. Terapkan policy/helper terpisah yang sudah disetujui dan diuji; baru provision LOGIN/credential runtime dan canary cutover aplikasi. Smoke kedua aplikasi dengan akun uji sah: confirmed Auth, profil aktif, assessment→PDF, booking/consent, lifecycle/chat hanya bila kebijakan mengizinkan, admin operational; uji cross-app denial dan kedua ledger.
8. Pantau 42501, 23514, P2004/P2010, deny-rate, latency/lock timeout/deadlock, kegagalan signup/PDF dan migration status. Log operation ID, role aplikasi, kategori error dan waktu; jangan log token, SQL parameter, jawaban, skor, isi pesan, object key atau PII. Detail diagnostik tersimpan terbatas dengan retensi yang disetujui.
9. Bila gagal, hentikan traffic/mutasi dan cutover; jangan otomatis mengembalikan postgres runtime, RLS off atau browser/service-role grants. Sebelum commit gunakan rollback transaksi. Sesudah commit, diagnosis dan recovery ledger terarah atau forward migration dengan approval. Revert aplikasi hanya bila versi sebelumnya kompatibel dengan schema dan credential aman. Restore hanya lewat rencana disaster recovery lintas tim, bukan overwrite shared DB sepihak. Rotasi ulang credential bila ada exposure.

## L. Berkas berubah dan Git

Sepuluh deliverable baru:

- `docs/PHASE3-STAGE3E1-DATABASE-SECURITY.md`.
- `docs/sql/stage3e1/01-preflight.sql`.
- `docs/sql/stage3e1/02-role-proposal.sql`.
- `docs/sql/stage3e1/03-object-privileges.sql`.
- `docs/sql/stage3e1/04-verification.sql`.
- `docs/sql/stage3e1/05-recovery.sql`.
- `scripts/stage3e1-rehearsal.mjs`.
- `scripts/stage3e1-security-checks.mjs`.
- `tests/rehearsal/stage3e1.rehearsal.ts`.
- `vitest.stage3e1.rehearsal.config.ts`.

Semua masih untracked: sepuluh berkas baru, **807 baris tambahan, 0 baris dihapus**; `git diff --stat` tracked kosong. Worktree juga tetap berisi `tatus` dari awal. Branch/HEAD tetap `riehand_branch`/`243cb9b`; tidak ada perubahan staged/commit/push. Evidence `.tmp` diabaikan Git. Stage ini menyelesaikan eksperimen dan proposal lokal, **bukan menyelesaikan blocker produksi runtime least-privilege**.
