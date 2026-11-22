# Phase 3 — Stage 3C: Super Admin Management & Monitoring

Tanggal: 21 November 2026. Branch: `riehand_branch`. Baseline lokal: `b15b274` (`feat(phase3): implement secure human consultation chat`). Implementasi dan pengujian memakai data sintetis. Tidak ada koneksi Supabase hosted, deployment, commit, push, atau perubahan dependency.

## A. Temuan arsitektur awal

Dashboard `/admin/dashboard` masih memakai RolePlaceholder. Worktree memiliki 26 berkas perubahan Stage 2B.3/3A sebelum tahap ini, walaupun implementasi Stage 3B sudah tercatat di HEAD. Inventaris hash awal disimpan di `.tmp/stage3c/initial-worktree.json`; pekerjaan tersebut dipertahankan. Fixture visual bersama ditambah untuk admin.

Model yang dipakai kembali: User, PsychologistProfile, PsychologistAvailability, AcademicPeriod, AssessmentSession, Appointment dan ConsultationSession. Tidak diperlukan perubahan Prisma schema atau migrasi. AcademicPeriod hanya memiliki ACTIVE/INACTIVE, batas tanggal, serta assessmentLimit integer. Partial unique index database membatasi satu ACTIVE secara global; ini lebih ketat daripada larangan periode aktif bertumpang tindih. Layanan asesmen lama memilih status ACTIVE, bukan kelayakan berdasarkan tanggal; perilaku bisnis itu tidak diubah.

Guard lama memverifikasi Supabase `auth.getUser`, konfirmasi email, dan profil aktif dari database. Role dari metadata/client bukan sumber otorisasi. Panduan lokal Next.js tentang Route Handlers dibaca sesuai AGENTS.md; route parameter dinamis memakai Promise, tanpa cache data admin. Referensi lokal skill prisma-client-api dipakai untuk query/transaksi pada Prisma 5.22 yang sudah terpasang.

## B. Berkas baru dan dimodifikasi

| Berkas | Perubahan |
| --- | --- |
| `src/app/admin/dashboard/page.tsx` | Mengganti placeholder; guard halaman, identitas admin, logout, rentang awal 30 hari WIB |
| `src/components/admin/console.tsx` | Baru: empat tampilan, filter, pagination, loading/error/retry dan form persiapan periode |
| `src/components/admin/console.css` | Baru: gaya admin responsif mengikuti warna WellBeing Hub |
| `src/lib/admin/service.ts` | Baru: otorisasi transaksi, agregat, DTO operasional dan persiapan periode lokal |
| `src/lib/admin/http.ts` | Baru: guard API, no-store, Origin, parsing dan error aman |
| `src/lib/admin/errors.ts` | Baru: error domain admin |
| `src/lib/validations/admin.ts` | Baru: validasi ketat tanggal, filter, cursor dan command |
| `src/app/api/admin/overview/route.ts` | Baru: ringkasan operasional |
| `src/app/api/admin/periods/route.ts` | Baru: daftar dan persiapan periode nonaktif lokal |
| `src/app/api/admin/periods/[periodId]/route.ts` | Baru: detail periode |
| `src/app/api/admin/psychologists/route.ts` | Baru: pemantauan psikolog |
| `src/app/api/admin/appointments/route.ts` | Baru: pengawasan janji hanya baca |
| `tests/admin-service.test.ts` | Baru: 43 tes layanan/validasi |
| `tests/admin-api.test.ts` | Baru: 20 tes API/otorisasi |
| `tests/browser/admin.spec.ts` | Baru: 13 tes browser sintetis |
| `tests/rehearsal/stage3c.rehearsal.ts` | Baru: 10 tes PostgreSQL terisolasi |
| `vitest.stage3c.rehearsal.config.ts` | Baru: konfigurasi rehearsal dengan guard isolasi |
| `scripts/stage3c-rehearsal.mjs` | Baru: memperluas harness lama tanpa menyunting skrip tahap sebelumnya |
| `tests/visual/main.tsx` | Menambahkan fixture admin; fixture tahap sebelumnya dipertahankan |
| `docs/PHASE3-STAGE3C-SUPERADMIN.md` | Baru: laporan ini |

## C. Fungsi dashboard

| Indikator | Definisi dan cakupan |
| --- | --- |
| Peserta aktif terdaftar | Jumlah User berperan PARTICIPANT dan aktif, global saat query |
| Psikolog aktif | Jumlah User berperan PSYCHOLOGIST dan aktif, global saat query |
| Asesmen dimulai | AssessmentSession.startedAt di rentang tanggal, opsional academicPeriodId |
| Asesmen selesai | Status COMPLETED dan completedAt di rentang tanggal, opsional academicPeriodId |
| Janji per status | Appointment berdasarkan scheduledStartAt; periode melalui assessmentSession |
| Konsultasi per status | Status tersimpan ConsultationSession, mengikuti jadwal mulai appointment terkait |
| Ketersediaan | Jumlah slot AVAILABLE/BOOKED/UNAVAILABLE pada tanggal, psikolog aktif; tidak memiliki relasi periode asesmen |
| Periode aktif | Record berstatus ACTIVE, ditampilkan terpisah dari filter periode |

Tanggal kalender memakai Asia/Jakarta: awal hari inklusif hingga awal hari sesudah tanggal akhir eksklusif. Kolom DATE availability memakai tanggal kalender, sedangkan timestamp asesmen tanpa timezone diperlakukan sebagai UTC sesuai penyimpanan Prisma. Status konsultasi yang belum direkonsiliasi tetap ditampilkan sebagai status tersimpan; dashboard tidak memicu mutasi lifecycle.

Rentang maksimal 93 hari inklusif, halaman default 10/maksimal 50, keyset pagination. Slot psikolog hanya dihitung untuk ID pada halaman tersebut. Setiap statement dibatasi 3 detik, transaksi 15 detik dengan maxWait 5 detik. Index yang sudah ada dipakai bila cocok; count global dan beberapa agregat tanggal masih memerlukan review EXPLAIN serta uji kapasitas sebelum produksi. Tidak ada klaim semua query memakai index optimal.

UI memiliki empat navigasi berbahasa Indonesia, tabel dengan caption/header, indikator loading dan error, retry, state kosong, fokus keyboard dan layout mobile. Perubahan filter mengganti instance pembacaan; abort dan pemeriksaan signal mencegah respons lama mengisi tampilan baru. Tidak ada nilai statistik buatan atau grafik placeholder. Indikator kesehatan mental selalu dinonaktifkan.

## D. Pengelolaan periode akademik

Daftar, detail, status aktif dan batas asesmen hanya baca. Persiapan record baru memakai status **INACTIVE**, bukan status DRAFT baru. Hanya diizinkan bila NODE_ENV development/test dan DATABASE_URL berprotokol PostgreSQL dengan hostname loopback. Production dan target nonlokal menolak pembuatan. Pemeriksaan hostname bukan pembuktian bahwa port forwarding tidak menuju server lain; pengujian tahap ini memakai guard Docker/marker isolasi yang lebih kuat.

Nama wajib 1–120 karakter setelah trim; tanggal harus valid dan akhir tidak mendahului awal; assessmentLimit harus integer 0–2147483647 sesuai batas kolom. Nilai tersebut adalah batas teknis, bukan kuota institusi yang disetujui. Awal periode harus setelah hari ini WIB berdasarkan clock database setelah lock. Batas overlap dengan ACTIVE inklusif ditolak; nama/tanggal identik yang sudah tersimpan ditolak.

Transaksi READ COMMITTED mengunci actor FOR SHARE lalu tabel academic_periods dengan SHARE ROW EXCLUSIVE untuk menserialisasi penulis periode, memeriksa kondisi, dan menyisipkan INACTIVE. Lock tetap kompatibel dengan pembacaan FOR SHARE layanan asesmen. Tes memakai koneksi/PID berbeda serta blocker, bukan hanya Promise paralel. Rollback kegagalan insert dan kelestarian periode historis diperiksa.

Tidak ada edit/delete periode lama, aktivasi, penonaktifan, perubahan kuota existing, atau pembaruan hasil historis. Alternatif INACTIVE boleh bertumpang tindih; tidak mengaktifkan kuota peserta. Submit ganda ditahan di UI, duplicate identik ditolak di server. Ini bukan kontrak exactly-once untuk perubahan nama atau pengetikan ulang setelah respons hilang; muat ulang daftar bila hasil penyimpanan tidak pasti.

## E. Pemantauan psikolog

Menampilkan nama, gelar/kualifikasi, fokus, bahasa, metode konsultasi, status aktif/nonaktif, serta jumlah slot tersedia/dipesan/tidak tersedia. Akun psikolog yang belum memiliki profil diberi state eksplisit. Filter status dan tanggal serta pagination tersedia. Email, telepon dan identitas peserta tidak disertakan. Provisioning, aktivasi akun, dan assignment role tidak diimplementasikan; memerlukan workflow istimewa yang terkontrol.

## F. Pengawasan janji

Hanya baca: status janji, jadwal mulai/akhir WIB, nama psikolog, dan status sesi tersimpan. Filter tanggal, periode asesmen dan status, serta cursor pagination tersedia. Tidak ada participantId/nama/kontak peserta, assessment/report ID, notes, score, consent atau message body dalam row DTO. Cursor memuat waktu dan ID appointment internal untuk urutan stabil; bukan token otorisasi dan bukan ID peserta.

Tidak ada pembatalan, reschedule, reopen atau edit status oleh admin. Monitoring tidak mengubah Appointment, ConsultationSession, Consent, AssessmentSession maupun ConsultationMessage.

## G. Autentikasi dan privasi

Setiap handler memanggil requireApiRole(SUPERADMIN); layanan memeriksa kembali role aktif dalam transaksi dengan actor row lock. Participant, psychologist, akun nonaktif, profil hilang, email belum dikonfirmasi, serta autentikasi invalid ditolak. Tidak ada API pemberian role atau insert public.users. Fixture admin hanya dibuat melalui Auth trigger sintetis, dibuktikan tetap PARTICIPANT meskipun metadata memalsukan SUPERADMIN, lalu role diubah oleh setup tes berprivilege dalam database terisolasi.

Semua respons handler menggunakan private/no-store. POST memeriksa Origin. Field asing, parameter berulang, tanggal/cursor invalid dan body non-JSON ditolak. Body JSON dibatasi 2000 karakter setelah dibaca; pembatasan ukuran/timeout sebelum buffering di proxy masih menjadi pekerjaan operasional. Error database tidak dikirim mentah dan handler tidak mencatat data sensitif.

Agregat tidak membaca jawaban, skor, PDF atau konten chat. Filter klinis/participantId tidak tersedia. SUPERADMIN tetap ditolak oleh route riwayat asesmen, PDF dan Human Chat lama; pembatasan juga diuji pada layanan chat/report nyata. Schema Flutter chatbot tidak disentuh. Tidak ada akses analytics terhadap memori atau percakapan chatbot. Ambang privasi klinis belum ditentukan dan fitur tersebut tetap nonaktif.

## H. Kontrak API

Semua endpoint di bawah `/api/admin`; sukses `{ success: true, data }`, gagal `{ success: false, error: { code, message } }`. Status sukses saat ini 200 termasuk create. Daftar memakai `{ items, nextCursor }`; periods juga mengembalikan activePeriod dan canCreate.

| Metode/path | Input | Data |
| --- | --- | --- |
| GET `/overview` | from, to, optional periodId | Count operasional, status/count arrays, activePeriod, scope, clinicalIndicatorsEnabled=false |
| GET `/periods` | optional limit, UUID cursor, ACTIVE/INACTIVE status | Halaman periode, activePeriod, canCreate |
| GET `/periods/:periodId` | UUID path; tanpa query tambahan | id, name, startDate, endDate, assessmentLimit, status |
| POST `/periods` | JSON name, startDate, endDate, assessmentLimit; same Origin | Periode INACTIVE baru, hanya lokal/test |
| GET `/psychologists` | from, to; optional limit, UUID cursor, active=all/true/false | Nama/profil profesional/status dan count slot |
| GET `/appointments` | from, to; optional limit, cursor base64url, periodId, status | Jadwal/status/psikolog/status sesi; tanpa identitas peserta |

Tanggal berformat YYYY-MM-DD, UUID divalidasi, status whitelisted. Status gagal: 401 belum terautentikasi, 403 akses/Origin/policy, 404 periode tidak ditemukan, 409 overlap/duplicate, 413 body terlalu besar, 415 content-type, 422 validasi, 503 unavailable/configuration conflict. Metode edit/delete tidak tersedia.

## I. Tes dan evidence terisolasi

Perintah validasi akhir dijalankan berurutan, tanpa build/browser bersamaan.

| Pemeriksaan | Hasil aktual |
| --- | --- |
| `npm.cmd test` | PASS 547/547 dalam 33 file, termasuk 63 tes unit/API admin baru |
| `npm.cmd run test:browser -- --reporter=list` | PASS 120/120, termasuk 13 tes admin; 1,7 menit |
| `npm.cmd exec -- tsc --noEmit` | PASS, exit 0 |
| `npm.cmd run lint` | PASS, 0 error; dua warning no-img-element lama di src/app/page.tsx:54 dan :160 |
| `npx.cmd prisma validate` | PASS, URL localhost sintetis; tanpa koneksi DB |
| `npm.cmd run build` | PASS pada pengulangan identik, exit 0; 38 halaman dihasilkan, lima route admin dinamis tercatat; warning keamanan tetap ada |
| `git diff --check` | PASS; 18 berkas baru juga diperiksa whitespace secara terpisah tanpa staging |
| `node scripts/stage3c-rehearsal.mjs --create-approved-synthetic` | PASS: 43 tes PostgreSQL (6 baseline + 12 Stage 3A + 15 Stage 3B + 10 Stage 3C), 33 pemeriksaan SQL dan delapan checksum migrasi cocok |

Evidence PostgreSQL: `.tmp/phase3-rehearsal-2026-11-21T04-10-39.263Z/`, khususnya result.json, execution.log, stage3c-checks.jsonl, stage2b3-checks.log, ledger-postcheck.log dan schema-catalog.log. Hasil `PASS_SYNTHETIC_POSTGRESQL_ONLY`, PostgreSQL 17.11, Prisma 5.22. Container/volume unik dan marker isolasi diverifikasi oleh harness. Runtime Auth/chatbot katalog tetap sama; shared hosted Auth tidak dipanggil. `hostedAuthVerified=false` dan `backupRestored=false` tetap eksplisit.

Tes baru mencakup active trusted role pada semua endpoint/layanan, penolakan peserta/psikolog/akun nonaktif, forged metadata/body/query, Origin, error aman/no-store, zero-data, agregat dan batas WIB, rentang 93 hari, tanggal leap-day, kuota invalid, periode aktif overlap, duplicate concurrent, rollback, preservation historis, pagination/filter, psikolog nonaktif/profil kosong, minimisasi DTO janji, serta penolakan chat/PDF/riwayat individual. Browser menguji respons terlambat, loading/retry, submit tunggal, state kosong, navigasi keyboard dan mobile. Regresi booking, consent, availability, report, lifecycle dan Human Chat lama tetap lulus.

Kegagalan awal tidak disembunyikan: rehearsal pertama di `.tmp/phase3-rehearsal-2026-11-21T04-07-54.251Z/` lulus 9/10 tes baru tetapi oracle SQL tes keliru menginterpretasikan timestamp asesmen tanpa timezone. Oracle diperbaiki dengan konversi UTC → Asia/Jakarta; query layanan tidak perlu diubah dan rerun 10/10 lulus. Browser awal 11/13: lookup label exact mencakup teks option karena label membungkus select. Label status dibuat eksplisit dengan htmlFor/id; seluruh suite 120/120 kemudian lulus. Pemeriksaan TypeScript awal menemukan negative test role SUPERADMIN yang perlu cast eksplisit untuk menguji penolakan runtime; diperbaiki tanpa memperluas tipe role layanan produksi.

Build pertama selesai compile/TypeScript/prerender tetapi exit 1 dengan SecurityFatalError untuk Next.js 16.4.2. Pengulangan perintah identik exit 0 dengan warning keamanan. Tidak ada konfigurasi bypass keamanan atau upgrade; keberhasilan build tidak menyelesaikan vulnerability tersebut.

Build/Prisma memakai URL database dan Supabase localhost serta credential sintetis pada environment proses saja. Tidak ada file environment atau secret yang diubah. Tes browser memakai interceptor API dan memblokir jaringan eksternal. Permission child process digunakan untuk toolchain/Chromium/Docker lokal, bukan akses hosted.

Ringkasan git: kontribusi Stage 3C adalah **20 berkas: 18 baru dan dua dimodifikasi** sebagaimana daftar B. Seluruh worktree memiliki 45 berkas berubah/baru, termasuk pekerjaan lama. `git diff --stat` tracked menunjukkan enam berkas, +40/-4; angka tersebut mencakup perubahan tahap sebelumnya dan tidak mencakup berkas untracked. Snapshot 26 berkas awal cocok untuk 25 berkas; hanya tests/visual/main.tsx ditambah fixture admin, dengan fixture lifecycle lama tetap utuh. Schema, delapan migrasi, package.json dan lockfile tidak diubah oleh Stage 3C. Tidak ada staging, commit atau push.

## J. Kebijakan institusi yang belum tersedia

1. Pemilik, persetujuan dan audit proses provisioning/deprovisioning admin/psikolog, termasuk pemisahan tugas.
2. Kalender periode, arti tanggal efektif, aktivasi/penonaktifan, kuota dan dampak perubahan pada peserta existing.
3. Ambang minimum agregat klinis, suppression/differencing, disclosure serta tujuan akses. Tidak dipilih angka ambang secara sepihak.
4. Kebutuhan dan otorisasi akses detail peserta oleh admin; default tetap tanpa identitas peserta.
5. Retensi, audit akses, hak subjek, eskalasi dan kebijakan lifecycle/chat dari tahap sebelumnya.

## K. Blocker produksi dan batas bukti

- Hosted Supabase belum menerima migrasi Phase 2/3 yang tertunda. Tidak ada migrasi hosted, backup/restore production atau UAT data nyata dalam tahap ini.
- Persetujuan kebijakan pada J, audit otorisasi dan workflow kontrol diperlukan sebelum membuka kemampuan yang diblokir. Tes sintetis tidak memberi persetujuan kebijakan.
- Pemisahan privilege runtime/deployer, grant/default ACL, credential custody, audit/redaksi log DB/proxy/APM dan boundary Flutter tetap pekerjaan tersendiri. Rehearsal menggunakan koneksi postgres berprivilege; tidak membuktikan least-privilege hosted.
- Warning keamanan Next.js 16.4.2 dari tahap sebelumnya **belum terselesaikan**. Tidak ada upgrade paket atau perubahan lockfile; detail advisory tetap dirujuk pada laporan Stage 3B.
- Query-plan/load/rate-limit review, batas request upstream, timeout jaringan dan observability tanpa data pribadi belum merupakan acceptance produksi.
- Prisma migrate diff masih terbatas oleh P4002 untuk FK public.users → auth.users pada datasource single-schema. Katalog/checksum/runtime diperiksa tanpa mengubah Auth untuk menghindari error.
- Browser memakai komponen asli dengan API mock pada harness lokal, bukan acceptance session/cookie hosted. API auth memakai mock Auth dengan guard sebenarnya; transaksi memakai PostgreSQL sintetis nyata.

## L. Usulan workstream berikutnya

Prioritaskan remediasi dependency Next.js pada branch terpisah dan review least-privilege/rollout bersama pemilik database serta tim Flutter. Institusi kemudian perlu mengesahkan lifecycle periode, provisioning dan privacy/disclosure; setelah itu rancang aktivasi produksi dengan audit, pengujian kapasitas dan UAT. Jangan mengaktifkan statistik klinis atau akses data individual hanya karena dashboard operasional sudah berjalan.
