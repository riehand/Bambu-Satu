# Phase 3 Stage 3B — Human Consultation Chat

Tanggal: 21 November 2026, Asia/Jakarta. Branch: `riehand_branch`.

Fondasi chat teks peserta–psikolog telah diimplementasikan untuk pengujian lokal sintetis. GET dan POST chat tetap ditolak pada `NODE_ENV=production`. Tidak ada migrasi hosted, koneksi hosted Supabase, perubahan secret/package, commit, push, merge, atau deployment.

## A. Arsitektur awal dan integrasi

Stage 3A sudah memiliki appointment → satu consultation session, check-in kedua pihak, start/end, waktu jadwal dua jam, serta expiry consent appointment. Dashboard bersama dipakai halaman peserta `/participant/appointments` dan psikolog `/psychologist/dashboard`. Chat dipasang pada dashboard tersebut tanpa mengubah layanan lifecycle, booking, consent, scoring, PDF, Storage atau Auth.

AGENTS.md dan dokumentasi Route Handlers/data security lokal Next.js telah ditinjau. Route baru menggunakan async params, autentikasi `appointmentApi("PARTY")`, respons private/no-store, dan origin mutation yang sama dengan Stage 3A. Referensi Prisma Client digunakan sesuai versi terpasang 5.22.0; tidak mengadopsi adapter/API versi 7 atau memperbarui dependency.

Worktree awal berisi 29 berkas pekerjaan Stage 2B.3/3A yang belum di-commit. Snapshot hash tersedia di `.tmp/stage3b/initial-worktree.json`. Sebanyak 28 tetap identik; satu berkas dashboard Stage 3A mendapat integrasi chat. Seluruh sepuluh berkas Stage 2B.3, termasuk migrasi C4, SQL keamanan dan harness, dipertahankan identik. Harness baru memperluas harness lama melalui anchor yang harus cocok persis.

## B. Berkas dibuat/diubah

Dua berkas existing diubah:

| Berkas | Perubahan |
| --- | --- |
| `prisma/schema.prisma` | Model ConsultationMessage dan dua reverse relations |
| `src/components/consultations/dashboard.tsx` | Satu panel chat terbuka per appointment, mengikuti status lifecycle |

Empat belas berkas baru:

| Berkas | Fungsi |
| --- | --- |
| `prisma/migrations/20261121000000_consultation_messages/migration.sql` | Migrasi aditif, trigger, RLS dan pencabutan hak akses |
| `src/lib/consultations/chat-policy.ts` | Gate production, window dan konstanta |
| `src/lib/consultations/chat-service.ts` | Scoped query, transaksi, cursor, idempotensi, konfirmasi commit |
| `src/lib/validations/chat.ts` | Payload/query/cursor strict |
| `src/app/api/consultations/[appointmentId]/messages/route.ts` | GET/POST terautentikasi |
| `src/components/consultations/chat-panel.tsx` | Percakapan, polling, pagination, retry, cleanup |
| `src/components/consultations/chat-panel.css` | Bubbles responsif mengikuti warna dan tombol WellBeing Hub |
| `scripts/stage3b-rehearsal.mjs` | Rehearsal PostgreSQL lokal baru dengan guard lama |
| `vitest.stage3b.rehearsal.config.ts` | Konfigurasi tes DB terisolasi |
| `tests/rehearsal/stage3b.rehearsal.ts` | 15 tes database nyata |
| `tests/chat-service.test.ts` | 39 tes layanan/policy |
| `tests/chat-api.test.ts` | 21 tes route/auth/validasi |
| `tests/browser/consultation-chat.spec.ts` | 17 tes UI sintetis |
| `docs/PHASE3-STAGE3B-HUMAN-CHAT.md` | Laporan ini |

Tidak ada berkas historis migration yang diedit. Tidak ada perubahan pada schema/ledger/objek aplikasi Flutter. Pemeriksaan katalog objek eksternal di rehearsal memakai baseline sintetis yang telah ada; layanan chat tidak mengakses `chatbot.*`.

## C. Schema dan migrasi

Tabel baru milik website adalah `public.consultation_messages`. Percakapan memakai identitas consultation session yang sudah ada; tidak membuat ruang atau anggota alternatif.

| Kolom | Kontrak |
| --- | --- |
| `id` | UUID PK, dibuat Prisma di server |
| `consultation_session_id` | UUID FK session, DELETE RESTRICT / UPDATE CASCADE |
| `sender_id` | UUID FK public.users, DELETE RESTRICT / UPDATE CASCADE |
| `client_message_id` | UUID idempotensi wajib |
| `body` | VARCHAR(2000), non-null, nonblank check |
| `created_at` | TIMESTAMPTZ(3), waktu PostgreSQL, ditetapkan ulang oleh trigger |

Unique key `(consultation_session_id,sender_id,client_message_id)` dan indeks `(consultation_session_id,created_at,id)` mendukung retry dan pagination scoped. Trigger memegang appointment/session lock dan memastikan setiap insert berikutnya memiliki timestamp minimal 1 ms lebih besar dari pesan sebelumnya. Ini mencegah pesan terlambat dengan UUID lebih kecil terlewat dari cursor yang sudah dilihat. Timestamp berfungsi sebagai urutan server dengan resolusi milidetik, bukan ukuran presisi durasi klinis. Pesan yang timestamp urutannya mencapai akhir jadwal ditolak.

Payload API dibatasi 2.000 UTF-16 code units sebelum trim; database membatasi 2.000 karakter PostgreSQL. API dengan emoji dapat lebih ketat. NUL, whitespace-only, tipe salah dan properti tambahan ditolak. SQL juga menolak sender di luar kedua pihak, status/window invalid, serta insert yang melewati akhir jadwal.

RLS aktif tanpa policy Data API. `REVOKE ALL` diterapkan hanya pada tabel/fungsi baru untuk PUBLIC, anon, authenticated dan service_role, termasuk default grants yang diwarisi ketika tabel dibuat. Migrasi memeriksa effective table/column privileges dan jalur SET ROLE, termasuk MAINTAIN PostgreSQL 17; menemukan akses tidak diharapkan membatalkan migrasi. Tidak ada perubahan global default ACL atau role platform.

Migrasi ini mengikuti target rehearsal PostgreSQL 17.11. Kompatibilitas katalog/privilege target hosted harus diverifikasi dalam pekerjaan rollout terpisah. Owner/postgres tetap dapat melewati RLS; service_role dengan BYPASSRLS saja tidak dapat mengatasi pencabutan privilege tabel baru. Hasil tersebut bukan bukti konfigurasi hosted aman.

## D. Otorisasi pesan

Identitas berasal dari Supabase user yang diverifikasi dan profil authoritative aktif melalui guard lama. Hanya PARTICIPANT pemilik appointment atau PSYCHOLOGIST assigned. SUPERADMIN ditolak, bukan diberi hak baca otomatis. Layanan memeriksa ulang actor aktif dan role, assignment, serta role/keaktifan kedua pihak.

Setiap baca/kirim memeriksa appointment dan session konsisten, keduanya IN_PROGRESS, check-in/start telah tercatat, endedAt kosong, window cocok, dan `scheduledStartAt <= clock_timestamp() < scheduledEndAt`. Completed, closed, cancelled, rescheduled, no-show, belum dimulai dan expired ditolak. Tidak ada akses riwayat setelah penutupan sampai kebijakan institusi disetujui; ini pembatasan sementara, bukan kebijakan retensi.

DTO tidak membawa sender ID, email, reportId, jawaban, skor atau PDF. Hanya UUID pesan, body, createdAt, own, senderRole, serta clientMessageId milik actor sendiri. Cursor terikat appointment, bukan bearer credential; otorisasi tetap diperiksa pada setiap halaman.

## E. Kontrak API

Endpoint tunggal: `/api/consultations/{appointmentId}/messages`.

| Method | Input | Output sukses |
| --- | --- | --- |
| GET | UUID path; `limit` 1–50 (default 30); opsional salah satu `before` / `after` | `items`, `nextCursor`, `latestCursor`, `canSend`, `serverNow`, `scheduledEndAt` |
| POST | JSON strict `{clientMessageId: UUID, body: string}` | `{message, replayed}` setelah persistence dikonfirmasi |

Query ganda, unknown field, cursor invalid atau cursor dari appointment lain ditolak. GET awal mengambil halaman terbaru dan mengembalikannya kronologis; before mengambil riwayat lebih lama; after mengambil pesan lebih baru secara ascending. Batas halaman tetap berlaku pada reconnect backlog.

POST memeriksa Origin sama persis dengan SITE_URL tepercaya, bukan Host/forwarded headers. Tidak menerima senderId, role, timestamp, sessionId, status atau reportId dari browser. Error aman: 401 unauthenticated, 403 forbidden/policy/origin, 404 appointment tidak tersedia untuk actor, 409 closed/idempotency conflict/commit belum terkonfirmasi, 422 validasi, dan 503 layanan sementara gagal. Content-type dan ukuran JSON mengikuti wrapper lama (415/413).

Semua respons memakai `private, no-store, max-age=0`, Pragma no-cache dan Expires 0. Tidak ada `use cache`, unstable_cache, shared message cache atau unrestricted listing. Raw exception/SQL/body tidak diteruskan atau dicatat oleh kode chat.

## F. Perilaku frontend

Tombol Buka/Tutup chat tersedia pada entri konsultasi kedua dashboard. Hanya sesi aktif membuka panel; status lain memberi alasan. Pesan dibedakan Anda/rekan dengan bubbles, teks di-escape React, timestamp Asia/Jakarta/WIB, label textarea, batas panjang, aria-busy/status/alert, dan tombol keyboard-accessible. Tidak ada optimistic message yang dianggap tersimpan.

Ada loading, empty, sending, error, manual refresh, pagination pesan lama dan retry. Polling setiap lima detik hanya saat panel terpasang dan tab terlihat, satu read aktif pada satu waktu. Event online/visibility memicu refresh. AbortController, epoch, key appointment dan cleanup membuang respons lama serta interval ketika berpindah/menutup panel. Kegagalan baca menghapus riwayat yang ditampilkan dan menonaktifkan composer sampai load berhasil.

Retry mempertahankan UUID dan body persis sama; draft dibekukan selama hasil belum pasti. Jika respons POST hilang setelah commit, GET dapat mencocokkan pesan sendiri untuk memulihkan konfirmasi. Respons POST tidak memajukan cursor polling, sehingga pesan rekan yang datang lebih dahulu tidak terlewat. Merge berdasarkan ID mencegah duplikasi visual.

Closure dari dashboard, penolakan akses server, atau timer relatif waktu server menonaktifkan kirim dan menghapus pesan/draft dari panel. Backend tetap otoritas waktu; latency dapat membuat tampilan tertinggal sampai respons/poll berikutnya. Pesan/draft tidak disimpan di localStorage/sessionStorage. Reload penuh membuang draft dan key retry lokal; membuka kembali chat membaca pesan server. Tidak ada janji exactly-once untuk ketikan ulang manual setelah reload.

## G. Konkurensi, idempotensi, kegagalan

Urutan lock: actor user FOR SHARE → scoped appointment → session. Pengiriman memakai FOR UPDATE; pembacaan memakai FOR SHARE. Sesuai urutan Stage 3A completion sebelum consent locks. Appointment dibaca ulang setelah lock dan waktu diperoleh dari PostgreSQL setelah semua penantian. Transaksi READ COMMITTED, maxWait 5 detik, timeout 15 detik.

BEFORE INSERT memeriksa state/identitas, memberi urutan waktu, dan menjaga lock sampai transaksi selesai. Constraint trigger deferred memeriksa kembali clock/status sebelum commit. Penutupan yang lebih dahulu mendapat lock menolak send; send yang lebih dahulu mendapat lock selesai sebelum completion. Test menggunakan blocker dan backend PID berbeda, bukan hanya Promise bersamaan.

Key sama/sender/session sama + body ternormalisasi sama mengembalikan ID yang sama tanpa insert. Body berbeda memberi 409. Replay tetap memerlukan sesi aktif; key lama bukan bypass setelah closure. Gagal transaksi tidak mengonsumsi key.

**Temuan dari database nyata:** Prisma 5.22 dalam rehearsal mengembalikan promise transaksi tanpa error ketika PostgreSQL membatalkan commit akibat deferred trigger. Baris benar-benar tidak tersimpan. Karena itu layanan memverifikasi ID pesan sendiri melalui query scoped baru sesudah transaksi sebelum mengembalikan sukses. Bila persistence tidak ada/tidak dapat dikonfirmasi, respons aman 409 dan retry memakai key sama. Regresi terpisah menyisipkan jeda database yang melewati deadline untuk membuktikan tidak ada pesan maupun konfirmasi palsu.

Semantik trigger deferred didokumentasikan oleh [PostgreSQL 17 CREATE TRIGGER](https://www.postgresql.org/docs/17/sql-createtrigger.html). Pemeriksaan ini berjalan pada fase validasi commit database; tidak mengklaim jaminan real-time fisik antara instruksi clock terakhir, fsync dan penerimaan respons jaringan.

## H. Temuan privasi dan keamanan

Konten hanya teks percakapan manusia. Tidak ada lampiran, AI, rangkuman, analytics body, triage, akses admin, export/delete endpoint, atau implicit report-sharing consent. Jumlah consent tetap sama sebelum/sesudah kirim. Uji lifecycle/booking/consent/PDF lama tetap dijalankan.

Koneksi aplikasi rehearsal adalah postgres berprivilege. RLS tidak melindungi dari owner/superuser; perlu pemisahan runtime/deployer dan credential custody sebelum production. Postgres, proxy, APM atau error infrastructure dapat mencatat statement/constraint detail; konfigurasi redaksi dan larangan body/token logging harus diaudit terpisah. Implementasi tidak mengklaim E2EE, encryption-at-rest terverifikasi, hosted transport acceptance, atau retensi yang disetujui.

Versi terpasang Next.js dan eslint-config-next tetap **16.4.2**. Review sumber resmi 21 November 2026:

| Advisory resmi | Relevansi |
| --- | --- |
| [GHSA-rhh4-g77r-r9qj](https://github.com/vercel/next.js/security/advisories/GHSA-rhh4-g77r-r9qj) | Kebocoran/poisoning cache lintas pengguna dengan binary arguments pada use cache; 16.0.0–16.4.4 terdampak, patch 16.4.5 |
| [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) | Kebocoran root-param cache saat use cache dipanggil lewat unstable_cache pada cold-start race; 16.3.0–16.4.4 terdampak, patch 16.4.5 |
| [GHSA-f3mh-rxg3-f5g2](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2) | Nilai cookie HttpOnly dapat terbuka lewat internal response header pada Edge route yang mengatur cookie dengan NextResponse; rentang 16.x terdampak sampai 16.4.4, patch 16.4.5 |

`cacheComponents: true` aktif. Pencarian source tidak menemukan pemakaian langsung use cache, unstable_cache atau deklarasi Edge runtime. Chat memakai route runtime default dan no-store. Ini inferensi terbatas dari kode, bukan bukti aplikasi tidak terdampak atau audit dependency menyeluruh.

Rekomendasi upgrade terpisah: gunakan worktree/branch khusus, verifikasi advisory terbaru, selaraskan Next.js dan eslint-config-next ke patch 16.x yang sudah memperbaiki advisory (minimum 16.4.5; [rilis resmi 16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6) tersedia saat review). Periksa kompatibilitas React, review lockfile, lalu jalankan kembali auth/cookie/cache, unit, browser, PostgreSQL dan build. Tidak ada upgrade pada tahap chat.

## I. Hasil tes dan evidence aktual

Validasi akhir dijalankan berurutan; browser dan build tidak berbagi proses aktif.

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd test` | PASS 484/484, 31 file; 60 tes chat baru |
| `npm.cmd run test:browser -- --reporter=list` | PASS 107/107 pada rerun lengkap, termasuk 17 chat; 1,3 menit |
| `npm.cmd exec -- tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run lint` | PASS, 0 error; dua warning lama no-img-element di src/app/page.tsx:54 dan :160 |
| `npx.cmd prisma validate` | PASS, URL localhost placeholder, tanpa koneksi DB |
| `npm.cmd run build` | PASS pada pengulangan, exit 0; 34 halaman, route messages dinamis tercatat; warning keamanan tetap ada |
| `git diff --check` | PASS, exit 0; berkas baru juga diperiksa whitespace secara terpisah tanpa staging |
| `node scripts/stage3b-rehearsal.mjs --create-approved-synthetic` | PASS: 6 PostgreSQL lama + 12 lifecycle + 15 chat, 33 SQL checks Stage 2B.3, delapan migrasi/checksum |

Evidence rehearsal sukses: `.tmp/phase3-rehearsal-2026-11-21T03-20-10.521Z/` (`result.json`, `isolation.json`, `execution.log`, `operations.jsonl`, `stage3b-checks.jsonl`, dan evidence Stage 2B.3/3A). PostgreSQL 17.11, Prisma 5.22.0, image digest `sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`. Container `wellbeing-phase3-a36fb31cc3` dihentikan setelah tes; volume dan evidence dipertahankan. Child environment memakai localhost/port ephemeral, identitas DB marker, dan membuang hosted credentials. Baseline Auth adalah sintetis, bukan Supabase GoTrue nyata.

Run browser lengkap pertama: 106 lulus, satu tes existing `history empty at 768px` timeout menunggu `.wb-app`; screenshot menunjukkan halaman kosong. Bukti dipertahankan di `.tmp/stage3b/browser-first-failure.md` dan `.png`. Rerun lengkap lulus tanpa mengubah tes/kode riwayat; penyebab pasti kegagalan render sementara tersebut belum terisolasi. Semua tes chat lulus pada kedua run. TypeScript awal juga menemukan literal bigint pada tes baru; telah disesuaikan dengan target kompilasi proyek sebelum pemeriksaan final.

Build pertama selesai compile/typecheck/render tetapi keluar 1 karena SecurityFatalError Next.js. Command identik diulang dan keluar 0 dengan warning keamanan tetap tampil. Tidak ada bypass konfigurasi keamanan atau upgrade paket. Build menggunakan URL database/Supabase localhost dan key sintetis pada environment proses saja; tidak mengubah file environment. Prisma Client berhasil diregenerasi lokal untuk model baru. Izin proses di luar sandbox digunakan untuk toolchain/Chrome/Docker yang membutuhkan child process, bukan untuk akses hosted.

Migrasi baru SHA-256: `7e3245ed4c0f17b1c3f5691ee2333727d0a1d7ca79278b3f37cb3f876f80d3ce`. Tujuh checksum sebelumnya cocok; C4 tetap `cf2bc074ba494e022bfc26e22ee3806d4022fe6549e518bf770c459033f45ea4`. Rehearsal pertama di `.tmp/phase3-rehearsal-2026-11-21T03-16-30.016Z/` gagal pada ekspektasi error commit Prisma; temuan dan perbaikan dijelaskan di G, bukan disembunyikan sebagai hasil lulus.

Tes baru mencakup kedua actor, role invalid/SUPERADMIN, akun inactive, orang lain, identity forging, CSRF, invalid UUID/body/query/cursor, batas waktu, terminal states, ordering/pagination, concurrent send/end dua urutan, duplicate key, rollback, expiry pending, default grants/RLS/service_role, dan konfirmasi commit. Browser memakai API intercepted sintetis dengan jaringan eksternal diblokir, bukan database hosted.

Keterbatasan: Prisma migrate diff masih P4002 untuk FK intentional public.users → auth.users pada datasource single-schema, seperti Stage 2B.3. Tidak mengubah Auth untuk menghindari error; verifikasi memakai checksum/katalog/runtime. Tidak ada hosted migration, production restore, real user data, hosted Storage acceptance atau penetration/load test.

## J. Keputusan institusi yang belum tersedia

| Kebijakan | Keadaan saat ini |
| --- | --- |
| Durasi retensi | Belum ditetapkan; tidak ada purge/TTL |
| Hak export/delete | Belum ditetapkan; tidak ada endpoint |
| Emergency/escalation | Belum ditetapkan; tidak ada clinical triage otomatis |
| Moderation/reporting | Belum ditetapkan; tidak ada akses moderator/admin otomatis |
| Baca sesudah sesi | Ditolak sementara sampai disetujui |
| Lampiran | Tidak diimplementasikan |
| Enkripsi tambahan dan kontrol organisasi | Belum disetujui/diverifikasi; tidak mengklaim E2EE |

Gate server production tidak dapat diaktifkan dengan feature flag. Development/test hanya untuk data sintetis. Lifecycle policy Stage 3A tetap belum disetujui.

## K. Blocker production

1. Persetujuan kebijakan pada J dan lifecycle Stage 3A, berikut audit otorisasi serta UAT.
2. Least-privilege runtime/deployer, grant/membership/default ACL hosted, dan credential custody. Boundary owner/postgres belum diselesaikan.
3. Review/redaksi log DB/proxy/APM, transport/encryption/backup/restore serta kontrol akses operasional atas data sensitif.
4. Perbaikan dependency Next.js pada workstream terpisah dan regresi setelah upgrade.
5. Rollout migrasi/hardening bersama owner/Flutter yang diotorisasi terpisah; schema drift P4002 tetap perlu metode review yang disepakati.
6. Capacity/rate limiting, batas koneksi, timeout jaringan, observability tanpa body, reconnect backlog serta uji multi-client/operasional sebelum produksi. Polling lima detik bukan realtime; abort browser tidak membatalkan commit server.

## L. Rekomendasi workstream berikutnya

Prioritaskan approval privasi/lifecycle dan hardening runtime/Next.js. Setelah keputusan institusi terdokumentasi, rancang kontrol akses pascasesi, retensi/hak subjek, moderasi/escalation dan operasional sesuai keputusan tersebut. Jadwalkan UAT serta load/chaos tests terisolasi sebelum mempertimbangkan transport realtime atau aktivasi production. Jangan mengaktifkan chat hanya karena tes sintetis lulus.

Ringkasan git: Stage 3B mencakup 16 berkas (14 baru, dua dimodifikasi). `git diff --stat` tracked seluruh worktree mencakup pekerjaan lama: enam berkas, +51/-1; kontribusi tracked baru tahap ini adalah +19 schema. Dashboard Stage 3A dan berkas Stage 3B baru masih untracked sehingga tidak muncul pada stat biasa. Total worktree 44 berkas berubah/baru, termasuk pekerjaan tahap sebelumnya. Tidak ada staging atau commit.
