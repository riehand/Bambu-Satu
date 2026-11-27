# Final review paket Supabase shared WellBeing Hub

Tanggal: 26 November 2026. Branch `riehand_branch`, HEAD awal review `b840419`.

Pembaruan setelah review: [R1-R3-RESOLUTION.md](R1-R3-RESOLUTION.md) mencatat adapter scoped JWT, draft policy Storage, dan query metadata yang baru disiapkan. Temuan di bawah merekam paket sebelum perubahan tersebut; status hosted tetap BLOCKED sampai issuer dan metadata terverifikasi.

**Keputusan: BLOCKED untuk menerapkan paket lengkap saat ini.** Tidak ditemukan perintah destruktif terhadap objek Flutter atau Supabase Auth dalam enam pending migration dan gateway yang ditinjau. Namun, pembatasan credential Storage dan bukti ACL/namespace target belum cukup untuk menyatakan seluruh paket memenuhi least privilege pada project bersama.

Review ini hanya membaca file lokal dan dokumentasi publik Supabase. Tidak menjalankan SQL lokal/hosted, membuat bucket, menghasilkan/mengubah credential, menjalankan migration, mengubah data, commit, push, atau deploy. Perubahan implementasi dari pekerjaan sebelumnya dipertahankan. Tidak mengulang regression aplikasi.

## Hasil sembilan pemeriksaan

| Pemeriksaan | Status | Bukti dan batas kesimpulan |
| --- | --- | --- |
| 1. Lingkup objek website | PASS untuk lingkup SQL | DDL ditujukan ke 14 tabel website baru, schema `wb_*`, dan role website baru. Ada tambahan policy/grant/trigger pada `public.users` yang merupakan titik identitas bersama; bukan hanya objek baru yang disentuh. Tidak ada DDL/DML ke `chatbot.*`. |
| 2. Flutter dan Auth tidak diubah secara destruktif | PASS untuk isi paket | Tidak ada DROP/TRUNCATE, penggantian trigger Auth, penghapusan policy existing, perubahan password existing, perubahan global default privileges, atau penulisan data Flutter. FK baru ke `public.users` dapat memengaruhi penghapusan identitas kelak; lihat dampak di bawah. |
| 3. Dua baseline tidak diulang | PASS untuk manifest | `20261021144827_init_users` dan `20261023000000_supabase_auth` berstatus `preserve-applied`. Hash byte file cocok manifest; bukti ledger sebelumnya juga cocok. Jangan menjalankan seluruh delapan file secara manual pada shared. |
| 4. Semua pending kompatibel dengan target | BLOCKED untuk kepastian hosted | Dependensi internal dan urutan sesuai; uji PostgreSQL 17 terisolasi sebelumnya berhasil. Bukti target belum mencakup semua enum/fungsi/index/role/namespace yang mungkin bentrok dan seluruh default ACL. Tidak ada uji SQL baru pada review ini. |
| 5. Role/credential minimum | BLOCKED untuk paket lengkap | Dua login DB dirancang non-owner, NOBYPASSRLS, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOINHERIT; authority role NOLOGIN. Tetapi Storage worker masih menggunakan secret API project, bukan credential yang dibatasi ke satu bucket. Hak efektif dari PUBLIC/default ACL juga perlu dikonfirmasi. |
| 6. Bucket private | PASS untuk konfigurasi; BLOCKED untuk isolasi efektif | JSON menetapkan `public:false`, PDF, 5 MiB; worker menolak bucket public. Bucket belum dibuat. Belum tersedia bukti policy existing `storage.objects`/`storage.buckets`; private flag saja tidak membuktikan pemisahan laporan. |
| 7. Rencana pemulihan | PASS untuk rencana | Prosedur di bawah mempertahankan migration yang sudah commit dan memakai pemulihan maju secara terbatas. Ketersediaan recovery point/backup target belum dibuktikan; rencana bukan klaim restore sudah diuji. |
| 8. Identitas target | PASS berdasarkan bukti sebelumnya | Ref `bofoowyzlnfhwcstlmgp`; Auth dan DB cocok, PostgreSQL 17.11, pgcrypto pada `extensions`. Tidak diverifikasi ulang lewat SQL pada review ini. |
| 9. Potensi benturan consultation_messages | PASS terhadap objek Flutter yang diketahui | `public.consultation_messages` berbeda dari `chatbot.messages` dan `chatbot.chat_sessions`. Tidak membaca/menyalin/mengubah pesan Flutter. Ketersediaan nama fungsi public dan drift katalog tetap termasuk pemeriksaan nomor 4. |

## Bukti target dan integritas paket

Bukti lokal `.tmp/environment-consolidation/hosted-compatibility.json` dan `.tmp/hosted-setup/target.json` berasal dari pemeriksaan read-only sebelum instruksi review. Waktu modifikasi file masing-masing 2026-11-26 15:17:25 UTC dan 15:26:22 UTC; ini penanda file, bukan bukti keadaan database saat nanti dieksekusi.

Bukti tersebut menunjukkan tabel website public yang terinventarisasi saat itu hanya `users` (ledger migration diperiksa terpisah), RLS users aktif, policy authenticated `users_read_own_active_profile`, dan trigger Auth `wellbeing_auth_user_created`/`wellbeing_auth_email_changed`. Enam tabel Flutter yang dicatat adalah `chatbot._backend_migrations`, `chatbot.chat_sessions`, `chatbot.checkins`, `chatbot.messages`, `chatbot.safety_events`, `chatbot.user_memories`. Tidak membaca isi tabel-tabel itu.

Pemeriksaan offline review ini: **8/8 hash migration dan 15/15 hash sumber gateway cocok persis**, tanpa normalisasi line ending. Dua baseline tetap preserve-applied; enam lainnya pending. File SQL dan generator tidak diubah pada review ini.

| Artifact yang ditinjau | SHA-256 byte file |
| --- | --- |
| `gateways.sql` | `6b91b60318644ed46fdaaaecb9986bc9370a435fc4f91444839b2e0766156deb` |
| `scripts/prepare-staging-sql.mjs` | `4310aa961e5383a854bd840b3fbc6ba305d3443af83789d949d736e5efcf2033` |

Hash artifact ini melengkapi manifest yang sebelumnya hanya mencatat hash sumber. Perubahan byte atau regenerasi setelah review memerlukan pemeriksaan diff sebelum persetujuan. Flag `executed:false` adalah pencatatan lokal, bukan mekanisme pencegah eksekusi.

## Temuan yang harus ditutup

### R1 — Credential Storage worker lebih luas daripada role DB worker

`src/lib/reports/staging-worker-server.ts:16` dan `src/lib/reports/storage.ts:18` membuat client dengan `SUPABASE_SECRET_KEY`. Memisahkan proses dan role `wb_pdf_worker` melindungi koneksi PostgreSQL aplikasi, tetapi tidak membatasi credential HTTP Storage tersebut. Secret API memakai `service_role` dan melewati RLS; grants SQL tetap relevan untuk akses tabel. Lihat [dokumentasi API keys Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

Tidak ada bukti worker telah menyalahgunakan akses. Masalahnya adalah batas hak credential jika worker atau secret bocor. Hardcode nama bucket dan `upsert:false` membatasi kode normal, bukan kewenangan credential. Secret baru yang terpisah memudahkan pencabutan tetapi tidak otomatis menjadi bucket-scoped.

Sebelum aktivasi PDF shared, selesaikan pilihan akses Storage yang benar-benar dibatasi untuk worker dengan identitas terverifikasi dan policy khusus bucket, atau ajukan pengecualian risiko elevated service secara eksplisit kepada pemilik project. Pilihan kedua tidak boleh dilabeli least privilege. Jangan mencabut/mengganti key existing Flutter, memakai signer test, atau membuka akses browser untuk mengatasi temuan ini. Tidak ada credential dibuat pada review ini.

### R2 — Private bucket belum membuktikan penolakan akses lintas pengguna

`storage-bucket.json` hanya konfigurasi pembuatan bucket. Bukti metadata sebelumnya belum mencakup policy Storage. Policy permissive existing yang berlaku lintas bucket, bila ada, dapat berlaku pada bucket baru. Ini kemungkinan yang belum diverifikasi, bukan klaim bahwa policy seperti itu ditemukan. [Dokumentasi private bucket Supabase](https://supabase.com/docs/guides/storage/buckets/fundamentals) menjelaskan bahwa operasi dengan JWT pengguna tetap mengikuti policy Storage.

Sebelum membuat bucket, perlukan pemeriksaan metadata policy/grants Storage yang terbatas dan bukti bahwa caller tanpa otorisasi laporan tidak bisa membaca/menulis bucket tersebut. Jangan mengubah policy Flutter secara global. Bila perlu aturan tambahan, siapkan perubahan yang hanya berdampak pada `assessment-reports` dan ajukan kembali. Pemeriksaan SQL tersebut belum dijalankan karena instruksi review ini melarang SQL sampai persetujuan berikutnya.

### R3 — Konfirmasi kompatibilitas nama dan hak efektif target belum lengkap

Gateway memeriksa jumlah delapan migration selesai, keberadaan Auth/chatbot, versi PostgreSQL, dan absennya `wb_guard`/`wb_pdf`; belum memeriksa nama/checksum delapan ledger di dalam transaksi atau seluruh nama role/schema/type/function. Session `wellbeing.approved_hosted_ref` adalah konfirmasi operator, bukan bukti identitas server. `wb_crypto` juga harus kosong dari benturan. CREATE yang bentrok akan gagal; jangan menggantinya dengan DROP atau CREATE OR REPLACE pada objek milik tim lain.

Sebelum eksekusi setelah approval, cocokkan hostname/ref dengan target, dua baseline serta daftar pending exact, seluruh nama pada inventaris, default ACL/schema privileges dan membership efektif. Perhatikan `wb_guard.signing_key`: dilindungi ownership dan ACL/schema, tidak memakai RLS, dan revoke eksplisitnya hanya PUBLIC/website_runtime. Bukti sekarang belum memastikan tidak ada grant default kepada role lain. Jangan mengklaim kebocoran telah terjadi; belum ada objek ini di hosted berdasarkan bukti sebelumnya.

Semua enam pending migration memiliki BEGIN/COMMIT sendiri. Empat migration awal mencabut PUBLIC/anon/authenticated tetapi belum service_role; pencabutan service_role untuk tabel website baru selesai di gateway. Jika berhenti di tengah paket, jangan mengaktifkan aplikasi atau mengisi konten/data klinis. Default ACL tetap harus diketahui sebelum penerapan.

## Daftar objek dan dampak

Inventaris nama, jenis, signature fungsi, file, nomor baris, dan hash SQL ada di [OBJECT-INVENTORY.json](OBJECT-INVENTORY.json). Ini ekstraksi statis, bukan hasil katalog hosted; CREATE OR REPLACE yang mengubah fungsi yang dibuat lebih awal dalam paket dicatat sebagai beberapa occurrence. Index implicit dari PK/UNIQUE mengikuti definisi SQL.

### Enam migration pending, berurutan

| Migration | Objek/dampak utama |
| --- | --- |
| `20261023010000_phase2_assessment` | Tabel public: `academic_periods`, `assessment_question_sets`, `questions`, `assessment_sessions`, `assessment_answers`, `assessment_scores`, `reports`; 6 enum; index/FK/check; 5 fungsi dan trigger Phase 2; enable RLS dan revoke akses browser. |
| `20261028000000_psychologist_profiles` | `public.psychologist_profiles`, FK ke users dan unique user_id, RLS/revoke. |
| `20261029000000_psychologist_availability` | `public.psychologist_availability`, 2 enum, PK/FK/index, RLS/revoke. |
| `20261029000001_appointments_report_consent` | `public.appointments`, `consultation_sessions`, `consents`, `consent_audit_events`; 7 enum; composite unique tambahan pada assessment_sessions/reports/availability yang baru dibuat; index/FK/check; 2 fungsi dan trigger consent; RLS/revoke. |
| `20261120000000_psychologist_profiles_integrity` | ACCESS EXCLUSIVE lock tabel profil website baru; validasi ID/array; backfill NULL array ke array kosong; PK id dan NOT NULL/default array. Ini DML terbatas website, bukan paket tanpa perubahan data sama sekali. Tidak menghapus baris tidak valid; gagal jika invalid. |
| `20261121000000_consultation_messages` | Tabel `public.consultation_messages`, index, constraint, fungsi `public.guard_consultation_message()`, trigger before-insert dan deferred commit, RLS dan pencabutan akses Data API termasuk service_role. |

Total tabel baru: **19** — 14 public di atas, `wb_guard.signing_key`, dan `wb_pdf.keys`, `wb_pdf.jobs`, `wb_pdf.artifacts`, `wb_pdf.tickets`.

Enum public baru: `AcademicPeriodStatus`, `Instrument`, `ScoringDimension`, `AssessmentSessionStatus`, `DassCategory`, `ReportStatus`, `ConsultationSessionType`, `PsychologistAvailabilityStatus`, `AppointmentStatus`, `ConsultationSessionStatus`, `ConsultationEndedBy`, `ConsultationEndReason`, `ConsentType`, `ConsentAuditAction`, `ConsentAuditActorType`.

### Gateway, roles, dan objek existing

- Schema baru: `wb_guard`, `wb_crypto`, `wb_pdf`. Tidak memindahkan extension pgcrypto; wrapper menggunakan `extensions.hmac` dan `extensions.gen_random_bytes`.
- Dua calon login: `website_runtime`, `wb_pdf_worker`; SQL awal membuat keduanya NOLOGIN. Aktivasi/password merupakan tindakan terpisah yang belum disetujui.
- Sembilan authority NOLOGIN: `wb_identity_guard`, `wb_operational_monitor`, `wb_score_gateway`, `wb_display_projection`, `wb_booking`, `wb_consent`, `wb_pdf_reader`, `wb_pdf_finalizer`, `wb_pdf_access`. Membership/CREATE sementara untuk operator dicabut sebelum gateway COMMIT; tidak diberikan kepada runtime/worker.
- Keseluruhan paket mendefinisikan 40 nama fungsi berbeda, 80 policy baru, 13 trigger baru, dan 23 explicit CREATE INDEX. Nama lengkap dan lokasi tersedia di inventaris; count bukan bukti fungsi hosted berjalan.
- Fungsi inti: `wb_guard.subject`, `actor_role`, `own_profile`, `purpose`, `submit_assessment`, `operational_counts`, `psychologist_directory`, `public_slots`, `appointment_views`, `book_appointment`, `grant_consent`, `revoke_consent`, `expire_consents`, `report_access`, `booking_report_ready`; `wb_pdf.enqueue`, `authorize`, `worker_input`, `download_input`, `finalize`, `render_data`. Interactive `wb_guard.finalize_report` tetap menolak finalisasi; worker menggunakan jalur attestasi sendiri.
- `public.users`: tambahan grants kolom untuk role baru, 12 policy baru (`wb_guard_own_identity`, `wb_runtime_profile`, `wb_runtime_profile_lock`, `wb_monitor_users`, `wb_score_users`, `wb_score_user_lock`, `wb_projection_users`, `wb_d_users_read`, `wb_d_users_lock`, `pdf_users`, `pdf_user_lock`, `sprint3_identity`) dan trigger `wb_guard_profile` yang hanya aktif untuk `current_user='website_runtime'`. Tidak mengubah isi users, owner, grant existing, policy authenticated existing, atau trigger Auth. UPDATE(id) dipakai untuk row lock; guard/ WITH CHECK menolak mutasi yang tidak sah.
- FK dari tabel website mengacu pada `public.users`: menambahkan dependensi dan trigger referential-integrity internal PostgreSQL. Setelah data website ada, ON DELETE RESTRICT dapat menghalangi penghapusan profil bersama; ON UPDATE CASCADE dapat menyentuh baris website saat ID diubah. Ini bukan penghapusan data Flutter, tetapi perlu diselaraskan dengan prosedur retensi/penghapusan akun tim. Pembuatan FK/policy/trigger juga dapat menunggu lock users; jangan menjanjikan nol gangguan pada traffic.
- `public._prisma_migrations`: Prisma mencatat enam migration tambahan; dua entri applied dipertahankan. Gateway hanya membaca ledger, tidak mengubah ACL/RLS-nya.
- Metadata Storage yang direncanakan: satu bucket private `assessment-reports`, maksimum 5 MiB, MIME PDF. Tidak ada SQL policy Storage dalam paket ini dan tidak ada bucket/object dibuat.
- Key signing baru akan dihasilkan pgcrypto saat gateway dieksekusi; tidak ada key fixture/data klinis/account/seed asesmen yang disalin oleh paket.

### Consultation messages versus Flutter

Nama yang dipakai adalah `public.consultation_messages` dan `public.guard_consultation_message()`, bukan `chatbot.messages`. Kedua trigger `consultation_message_before_insert` dan `consultation_message_commit_guard` dipasang hanya pada tabel website baru. FK mengacu ke `public.consultation_sessions` dan `public.users`; fungsi memeriksa appointment/session website, bukan sesi chatbot. Tidak ada rename, copy data, penggantian policy, atau subscription/realtime publication Flutter.

Benturan nama tidak terlihat dengan enam tabel Flutter yang sudah terinventarisasi. Namun nama fungsi/enum public belum seluruhnya diverifikasi terhadap katalog terbaru; jika sudah ada, hentikan deployment. Migration menyiapkan schema pesan saja: gateway mengakhiri paket dengan REVOKE ALL consultation_messages dari website_runtime, tidak memasang lifecycle/chat gateway, dan gate hosted aplikasi tetap menolak fitur tersebut. Aktivasi chat/institusional tidak termasuk persetujuan paket.

## Rencana pemulihan tanpa merusak shared database

Rencana ini berlaku **setelah persetujuan penerapan**, bukan instruksi eksekusi sekarang.

1. Sebelum perubahan: catat target, checksum, ledger dua baseline, inventaris/ACL/trigger/policy existing yang relevan, serta recovery point yang tersedia melalui Dashboard/operator. Simpan bukti privat tanpa dump data klinis ke repo. Konfirmasikan siapa operator pemulihan. Jangan menganggap backup/PITR tersedia atau membeli layanan tanpa persetujuan.
2. Pertahankan runtime website baru belum aktif/NOLOGIN dan fitur tergantung gateway unavailable selama paket belum lengkap. Jangan menghentikan Auth/Flutter atau mengubah policy global. Terapkan migration melalui jalur yang disetujui dengan session timeout terbatas dan hentikan pada error; beberapa migration awal tidak menetapkan timeout sendiri.
3. Jika satu migration gagal: hentikan runner, catat nama/error tanpa secrets, periksa apakah transaksi rollback dan bagaimana ledger ditandai. Migration sebelumnya yang berhasil tetap ada. Jangan mengulang baseline, menghapus ledger, `migrate reset`, `db push`, DROP CASCADE, atau menandai migration sukses secara palsu. Sesudah penyebab diperbaiki dan rollback benar-benar terbukti, rekonsiliasi failed entry melalui prosedur Prisma yang disetujui; jangan mengubah file migration historis.
4. Jika gateway gagal sebelum COMMIT: rollback transaksi gateway. Pastikan tidak ada role/schema/grant parsial tersisa; enam migration yang sudah commit tidak ikut rollback. Pertahankan tabel website baru, jangan isi data atau aktifkan fitur. Koreksi artifact lokal, review diff, lalu minta approval untuk upaya berikutnya. Jika koneksi putus saat COMMIT, periksa katalog/ledger dahulu; jangan menebak transaksi gagal dan mengulang CREATE.
5. Jika gateway berhasil tetapi aktivasi credential/bucket/layanan gagal: biarkan role belum diaktifkan dan fitur unavailable. Jika login baru sudah aktif, penghentian akses hanya untuk dua role baru dilakukan oleh operator sesuai otorisasi pemulihan; jangan merotasi key bersama Flutter. Bucket yang sudah dibuat tetap private, jangan dihapus otomatis. Perbaiki langkah tersisa secara maju dengan persetujuan, tanpa rerun gateway first-time.
6. Jika gangguan existing ditemukan: hentikan perubahan website dan isolasi akses barunya. Bandingkan metadata dengan snapshot; buat corrective change yang hanya menargetkan delta website dan minta persetujuan operator/pemilik project. Restore seluruh shared project dapat memundurkan data Flutter/Auth, sehingga **bukan rollback default**. Restore, penghapusan objek, atau perubahan credential existing memerlukan keputusan pemilik dan persetujuan tersendiri.

## Kelanjutan integrasi

Review menghasilkan perubahan dokumen saja: `APPROVAL.md`, `FINAL-REVIEW.md`, `OBJECT-INVENTORY.json`. SQL pending/gateway, migration historis, env, credential dan kode aplikasi tidak diubah pada tahap review ini.

Langkah berikutnya tetap integrasi satu aplikasi dengan `npm run dev`: tutup R1, peroleh pemeriksaan metadata terbatas untuk R2/R3 dengan izin, lalu ajukan paket konkret yang diperbarui sebelum SQL/bucket/credential dijalankan. Tidak perlu fase rehearsal baru atau mengulang ratusan tes. Sesudah backend dan endpoint signer/worker hosted tersedia, jalankan satu acceptance terarah menggunakan akun sah dan konten yang disahkan. Paket SQL saja belum menyediakan konten asesmen, akun berperan psikolog/admin, endpoint layanan, atau bukti semua fitur dapat digunakan. Chat/lifecycle tetap nonaktif.
