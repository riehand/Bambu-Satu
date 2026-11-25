# Phase 4 - Audit Gap Fitur dan Rencana Penyelesaian

Tanggal: 24 November 2026 (Asia/Jakarta). Branch lokal: `riehand_branch`.

## Kesimpulan audit

Aplikasi sudah memiliki halaman, komponen, API dan service untuk sebagian besar perjalanan utama. Masalah terbesar adalah penyambungan antarlapisan dan perbedaan mode runtime, bukan kekurangan komponen UI. Belum ada bukti satu perjalanan melalui browser lokal yang menghubungkan login, asesmen, PDF privat nyata, booking, konsultasi dan dashboard admin dengan runtime database terbatas.

**Prioritas Phase 4:** selesaikan satu perjalanan pengguna sampai dapat dipakai, gunakan komponen yang ada, dan tampilkan kondisi gagal/pending secara jujur. Jangan menambah framework keamanan atau mengulang rehearsal lengkap pada setiap perubahan kecil.

Audit ini berdasarkan kode lokal, schema, proposal dan bukti pengujian tahap sebelumnya; bukan inspeksi hosted. Tidak membaca credential hosted, menjalankan hosted mutation, atau menyatakan fitur siap produksi.

## Cara membaca status

- **Selesai implementasi:** jalur frontend/API/service tersedia untuk cakupan yang disebutkan. Ini tidak otomatis berarti telah diterima secara end-to-end dengan database/Storage nyata.
- **Sebagian:** komponen ada, tetapi sambungan atau perilaku yang diperlukan perjalanan pengguna belum lengkap.
- **Terblokir:** mode runtime saat ini menolak operasi, prasyarat belum tersedia, atau kebijakan belum disetujui.
- **Belum ada UI:** kemampuan backend belum memiliki jalur pengguna yang sesuai, atau fitur tersebut memang belum diimplementasikan.

Dua mode harus dibedakan:

1. **Jalur aplikasi lama:** halaman dan API memakai auth guard dan service yang ada. Hak koneksi aktual tidak diaudit melalui credential; jalur ini tidak boleh diasumsikan sebagai bukti least-privilege atau dijadikan fallback.
2. **DAL lokal Stage E:** hanya dapat dipasang programatik dalam `NODE_ENV=test`. Banyak mutation sudah bekerja melalui `website_runtime`, tetapi page loader, auth entrypoint, beberapa read model dan report belum terhubung. Menjalankan `npm run dev` tidak otomatis mengaktifkan DAL tersebut.

Bukti Stage E (551 unit, 120 browser, 137 PostgreSQL) adalah baseline regresi dan integrasi service. Browser memakai harness sintetis; angka tersebut bukan bukti seluruh website dapat digunakan dengan database terbatas.

## Inventaris participant

| Perjalanan/fitur | Frontend | API/service | Database/runtime lokal terbatas | Status dan gap nyata |
| --- | --- | --- | --- | --- |
| Daftar, konfirmasi email, kirim ulang, login/logout | Form auth dan route konfirmasi ada | `/api/auth/register`, login, logout, resend; Supabase Auth dan profil aktif | Trigger profil historis ada; register preflight dan login profile lookup belum dibungkus boundary DAL | Sebagian; perlu auth lokal dan masuk ke halaman nyata, bukan hanya mock getUser |
| Shell, navigasi, ringkasan, kuota | Layout, dashboard, sidebar mobile ada | `getQuota`, history, resume | Service tersedia; page loader memanggil requirePageRole tanpa context DAL lokal | Terblokir pada mode DAL lokal; jangan mengganti dengan koneksi owner |
| Consent pemrosesan, mulai asesmen | Introduction dan CTA ada | Start session memeriksa consent, periode dan kuota | Start melalui runtime terbatas sudah diuji | Selesai pada service; penyambungan halaman nyata masih sebagian |
| DASS-21/WEMWBS, simpan, lanjutkan, review, submit | Questionnaire dan review tersedia | Answers/revision, ownership, submit, questions | Trusted scoring gateway menghasilkan score immutable dan report PENDING | Selesai pada service/API terpilih; belum acceptance browser-ke-DB lengkap |
| Hasil dan riwayat | ResultsView, HistoryList, link hasil tersedia | Session/history dan skor resmi | Read own data tersedia dengan context | Sebagian karena page boundary |
| Buat dan unduh PDF | ReportDownload dan ReportFileDownload terhubung | Generate/download route, renderer PDF nyata, read-back dan recheck akses pada jalur lama | Runtime terbatas tidak boleh update GENERATED; finalisasi worker belum terintegrasi | Terblokir end-to-end. Perbaikan awal Phase 4 membuat UI tidak menganggap semua HTTP 2xx sebagai GENERATED |
| Direktori dan detail psikolog | Daftar/pagination/detail dan widget jadwal ada | listPsychologists, getPsychologistById, public availability | Query daftar/profil lintas pengguna dan slot tidak didukung policy own-only B; proyeksi C hanya minimal identitas | Terblokir pada mode terbatas; berpotensi tampil kosong walau data ada. Bukan selesai hanya karena mutation booking lulus |
| Pilih tanggal dan booking | Slot, checkbox consent, POST booking, link konfirmasi ada | booking-context dan booking atomik | Gateway booking sudah bekerja; butuh report GENERATED nyata dan read jadwal | Sebagian. Error jadwal/context belum punya retry langsung; PDF belum siap belum diberi jalan pemulihan yang lengkap |
| Lihat janji/detail | AppointmentCenter dan endpoint detail ada | listParticipantAppointments/getAppointmentForParty | Mode DAL lokal secara eksplisit melempar APPOINTMENT_UNAVAILABLE | Terblokir read path; gunakan proyeksi aman yang cukup untuk DTO, jangan membuka tabel klinis |
| Consent appointment, cabut, beri ulang | Checkbox dan tombol revoke/reconsent ada | Grant/revoke/list/expiry terintegrasi gateway | Service terbatas sudah diuji | Sebagian UI: AppointmentCenter memuat 4 endpoint all-or-nothing; kegagalan daftar janji/direktori ikut menyembunyikan pengelolaan consent |
| Consent laporan mandiri | Pemilihan psikolog dan riwayat izin ada | Grant mandiri, revoke, list ada | Gateway menjaga independensi dari janji | Sebagian; daftar penerima dan PDF menghambat UI, psikolog belum punya inbox laporan mandiri |
| Check-in dan ruang konsultasi | ConsultationDashboard pada halaman janji | List/action API, timestamps dan eligibility server | Gateway check-in/start/end dan list service tersedia | Lokal development/test tersedia; page access dan prasyarat booking belum tuntas. Produksi terblokir kebijakan |
| Chat manusia | Panel send/read, retry dan pagination sudah dirender dashboard | Messages GET/POST, validasi, idempotensi | Gateway dan postcommit confirmation diuji | Sebagian end-to-end; hanya sesi aktif lokal. Produksi dan pembacaan pascasesi diblokir |
| Pendamping AI | Navigasi nonaktif berlabel Segera | Tidak ada integrasi website yang aktif | Flutter terisolasi | Belum ada fitur web; bukan prioritas implementasi Phase 4 ini |

## Inventaris psychologist

| Fitur | Frontend | API/service | Database/runtime lokal terbatas | Status dan gap |
| --- | --- | --- | --- | --- |
| Login dan dashboard peran | Dashboard dengan guard, logout | requirePageRole/getCurrentProfile | Profil aktif authoritative tersedia setelah context | Sebagian; boundary halaman/login belum tersambung |
| Profil profesional | ProfileEditor lengkap | GET/PATCH profile | Own-profile read/update tersedia | Selesai implementasi; perlu uji halaman nyata setelah boundary diperbaiki |
| Ketersediaan harian WIB | AvailabilityEditor, retry, loading/save terpisah | GET/PUT per tanggal | BOOKED tidak editable, own-slot policy | Selesai implementasi; bukti hotfix ada. Membuka slot belum membuat peserta dapat membacanya pada runtime terbatas |
| Daftar janji dan peserta | PsychologistAppointmentList ada | `/api/psychologist/appointments` | listPsychologistAppointments diblokir pada mode gateway | Terblokir; DTO counterpart dan ringkasan report/consent perlu read path terbatas |
| Unduh laporan appointment | Link download berdasarkan grant | Download memeriksa consent/assignment dan recheck sebelum respons | Bukti consent gateway ada, artifact route belum terhubung | Terblokir oleh PDF/Storage dan proyeksi baca |
| Laporan mandiri dari peserta | Tidak ditemukan inbox/daftar laporan mandiri pada dashboard | Ada grant mandiri dan report access backend | Grant bisa aktif tanpa appointment | Belum terhubung UI; perlu daftar metadata laporan yang memang diizinkan tanpa mengekspos hasil pengguna lain |
| Check-in, mulai, akhiri konsultasi | Dashboard tombol dan alasan disabled | Action API dan service ada | Kedua check-in, waktu server, early-close expiry tersedia | Lokal sebagian; produksi menunggu KKA |
| Chat dengan peserta | Panel pada dashboard | Send/read dan retry ada | Membership, window dan commit protections tersedia | Lokal sebagian; tidak boleh mengaktifkan produksi atau histori pascasesi tanpa kebijakan |

## Inventaris SUPERADMIN

| Fitur | Frontend | API/service | Database/runtime lokal terbatas | Status dan gap |
| --- | --- | --- | --- | --- |
| Login/dashboard admin | Halaman guarded dan console tab ada | Role aktif diperiksa | Boundary halaman/login belum terintegrasi | Sebagian |
| Ringkasan operasional dan filter tanggal/periode | OverviewView ada | `/api/admin/overview` memanggil adminOverview | adminOverview menolak mode gateway; adminRestrictedOverview tersedia tetapi tidak dipakai UI/API dashboard | Terblokir pada runtime terbatas; sambungkan aggregate kompatibel, tampilkan unavailable untuk field unsupported, jangan angka nol buatan |
| Daftar/detail periode | Tab, paging, detail ada | GET periods/detail | Metadata period tersedia dalam policy; alur runtime penuh belum acceptance | Sebagian |
| Buat periode persiapan | Form tersedia jika canCreate | POST hanya development/test dan DB localhost; INACTIVE saja | Validasi rentang dan overlap ada; writer runtime perlu dibuktikan | Sebagian lokal; bukan aktivasi periode |
| Aktivasi periode/perubahan kuota | Tidak tersedia sebagai aksi umum | Tidak ditemukan endpoint aktivasi/ubah kuota | Aturan historis dijaga | Terblokir kebijakan KKA; jangan menganggap tombol perlu langsung dibuat |
| Monitoring psikolog/ketersediaan | Tab filter dan paging ada | adminPsychologists ada | Mode gateway mengembalikan ADMIN_UNAVAILABLE | Terblokir read projection |
| Monitoring appointment/status | Tab filter dan paging ada | adminAppointments ada | Mode gateway mengembalikan ADMIN_UNAVAILABLE | Terblokir read projection |
| Kelola akun/role/aktivasi psikolog | Tidak ditemukan CRUD akun di console | Endpoint admin akun tidak ada | Profil/role tidak boleh dimutasi runtime sembarang | Belum diimplementasikan; definisi kewenangan/provisioning perlu KKA, jangan dijanjikan dari judul management |
| Indikator klinis/akses hasil individu | Indikator klinis nonaktif | Agregat terbatas tidak memberikan PDF individu | RLS/ACL klinis tetap membatasi admin | Sengaja diblokir; bukan gap yang boleh ditutup dengan SELECT luas |

## Halaman dan endpoint yang menjadi titik putus

- Seluruh `/participant/*`, `/psychologist/dashboard`, `/admin/dashboard`: page-role/profile dan loader belum memakai request context mode DAL lokal. Memperbaiki layout saja tidak cukup; server page dapat mengambil data secara terpisah dan harus ikut tercakup.
- `/api/auth/register` melakukan preflight Prisma sebelum identitas terverifikasi; `/api/auth/login` memuat profil setelah sign-in tanpa wrapper DAL. Perlu memakai kontrak Auth/profil yang tepat, bukan memalsukan user context untuk operasi anonim.
- `/api/psychologists`, `/{id}`, `/{id}/availability`: read lintas pengguna masih mengandalkan query ORM lama; policy terbatas tidak memenuhi data profesional/jadwal yang diminta UI.
- `/api/appointments`, `/{id}`, `/api/psychologist/appointments`: write booking terintegrasi, tetapi GET list/detail diblokir eksplisit.
- `/api/reports/{id}/generate` dan `/download`: belum memiliki boundary DAL dan worker finalization yang operasional. Metadata `/api/reports/{id}` melalui wrapper appointment tetapi lookup psikolog masih menggunakan jalur report lama yang tidak memperoleh row di RLS.
- `/api/admin/overview`, `/psychologists`, `/appointments`: kontrak penuh diblokir ketika gatewayMode aktif. Aggregate terbatas belum menjadi tampilan operasional.
- `/api/consultations` dan action/messages memakai wrapper yang sudah terintegrasi; masalah utamanya akses halaman/prasyarat dan kebijakan produksi, bukan kekurangan UI chat.

## Prioritas dan dependensi

Pembaruan 24 November 2026: P0-B dilaporkan selesai pada [Sprint 1](PHASE4-SPRINT1-ASSESSMENT-FLOW.md). **P0-C PASS lokal** pada [Sprint 2](PHASE4-SPRINT2-PDF-FLOW.md): participant login melalui Auth lokal, generate dari PENDING, upload/read-back Storage privat, finalisasi worker, refresh dan download PDF nyata telah dibuktikan. Gangguan Storage mempertahankan PENDING dan retry berhasil. Blocker infrastruktur/draft di bagian audit awal di bawah adalah catatan historis; Sprint 2 menggunakan container loopback terverifikasi dan adaptasi SQL terpisah, sambil mempertahankan draft asli. Custody signer produksi dan acceptance booking/consent psikolog tetap belum selesai.

| Urutan | Potongan fitur | Dependensi | Hasil yang harus terlihat pengguna |
| --- | --- | --- | --- |
| P0-A | Umpan balik PDF yang akurat dan navigasi direktori | Komponen/API yang sudah ada | PENDING tidak menampilkan unduhan; retry terkendali; direktori menjelaskan langkah berikutnya dengan benar |
| P0-B | Satu sesi aplikasi lokal terautentikasi dari browser ke DAL | Auth lokal, bootstrap runtime lokal terisolasi, guard existing | Peserta login, membuka dashboard, menyelesaikan asesmen dan melihat hasil sendiri tanpa koneksi owner |
| P0-C | PDF privat nyata dari hasil PENDING | P0-B + worker/Storage/finalisasi minimal yang belum selesai | Generate, download PDF valid, refresh tetap GENERATED; kegagalan Storage tidak menghasilkan sukses palsu |
| P1-A | Direktori/jadwal publik terbatas, booking dan daftar janji | P0-B; booking nyata membutuhkan P0-C | Psikolog membuka slot, peserta memilih slot, menyetujui sharing, booking muncul di kedua dashboard |
| P1-B | Pengelolaan consent yang bisa dipakai walau panel lain gagal | P1-A + PDF | Revoke/reconsent terlihat langsung; izin mandiri terpisah; psikolog menerima akses lewat UI yang sesuai |
| P2 | Konsultasi dan chat lokal end-to-end | Booking kedua pihak + waktu sintetis sesuai policy lokal | Kedua pihak check-in, psikolog start, bertukar pesan, end; sesi tertutup tidak menerima pesan |
| P3 | Dashboard admin operasional | Boundary lokal + aggregate/proyeksi existing yang kompatibel | Ringkasan, periode dan monitoring dapat digunakan tanpa akses hasil klinis individu |

P0-B dan P0-C adalah milestone integrasi pertama. Pekerjaan read projection tidak perlu menunggu kebijakan chat, tetapi perubahan privilege hanya boleh mencakup data yang benar-benar dibutuhkan fitur. Tidak membangun ulang renderer PDF, questionnaire, chat panel, console, atau scoring.

## Rencana penerimaan berbasis perjalanan nyata

1. **Peserta sampai hasil:** daftar/konfirmasi atau login akun sintetis yang diprovisikan secara sah; halaman menunjukkan kuota aktual; simpan lalu reload melanjutkan jawaban; submit sekali membuat hasil immutable dan report PENDING; akun peserta lain tidak bisa membuka hasil tersebut.
2. **PDF:** dari halaman hasil, lakukan generate; unduh bytes PDF yang dapat dibaca dan cocok report/skor; reload mempertahankan state; API accepted/PENDING tidak dianggap unduhan siap. Putuskan Storage dan coba ulang: hasil asesmen tetap ada, pesan gagal/pending jelas, tidak membuat GENERATED palsu atau menimpa artifact valid.
3. **Booking:** psikolog mengubah tanggal tersedia; peserta melihat waktu WIB yang sama; belum menyetujui consent tidak bisa pesan; setelah PDF siap, satu slot dipesan sekali dan tampil pada kedua pihak. Konflik slot memberi retry/muat ulang, bukan sukses semu.
4. **Consent:** psikolog assigned dapat mengunduh hanya dengan izin aktif; cabut dari UI peserta lalu permintaan baru ditolak; reconsent mencatat izin baru. Izin mandiri mempunyai jalur penerima tersendiri, tidak otomatis hilang karena appointment ditutup. Admin/pengguna lain tetap ditolak.
5. **Konsultasi/chat lokal:** mulai sebelum kedua check-in ditolak; setelah keduanya hadir pada jendela waktu lokal, start/send/read/retry/end bekerja melalui dua sesi browser. Refresh tidak menggandakan pesan, end mematikan send. Tidak ada klaim produksi aktif.
6. **Admin:** login admin membuka aggregate operasional, filter/pagination bekerja, kondisi unsupported ditandai unavailable. Tidak ada PDF pribadi, isi chat, atau score individu yang muncul. Periode persiapan tidak otomatis menjadi ACTIVE.

Untuk tiap potongan: tes fungsional terarah dan penolakan dasar (role/owner/consent/status) yang relevan. Milestone integrasi pertama dan akhir menjalankan full regression dan rehearsal yang sudah ada; bukan setelah setiap perubahan copy/UI. Bukti acceptance harus mencatat langkah pengguna, respons dan state persisted serta jenis lingkungan, bukan jumlah tes saja.

## Blocker KKA, produksi dan infrastruktur

- KKA: waktu check-in, toleransi terlambat, no-show, pembatalan/reschedule, reopening, penutupan otomatis dan siapa yang berwenang. Jangan menciptakan aturan ini di UI.
- KKA: aktivasi Human Chat, retensi/pembacaan pascasesi, kewenangan pengelolaan akun, perubahan role, aktivasi periode dan kuota. Indikator klinis tetap nonaktif.
- Produksi: custody signer independen, credential worker/Storage dan hosted acceptance belum selesai. Bukti lokal tidak menggantikan persetujuan produksi.
- Stage F terhenti sebelum worker, attestation, API dan E2E selesai. `docs/sql/stage3e1f/01-authorities.sql` serta `02-gateways.sql` adalah draft **belum diterapkan/divalidasi**, bukan baseline aman yang boleh langsung diaktifkan. Tahap ini mempertahankannya tanpa menjalankannya.
- Supabase CLI 3.3.0 berhasil memulai stack baru, tetapi binding aktual dua port adalah semua interface meskipun network diminta loopback. Lima container baru sudah dihentikan sebelum data aplikasi ditambahkan. Volume tetap dipertahankan. Stack ini belum diterima sebagai environment isolasi untuk fitur.
- Pemeriksaan Docker berikutnya tidak dieksekusi karena automatic approval review gagal akibat batas penggunaan layanan. Ini bukan hasil penilaian tindakan tidak aman. Jangan melewati approval tersebut; lanjutkan pekerjaan kode lokal yang tidak bergantung padanya. Bukti nonrahasia tersedia di `.tmp/stage3e1f/storage-containers.json` dan `storage-start.log`.

## Perubahan awal Phase 4 dan hasil aktual

Audit menemukan bug nyata pada `ReportDownload`: `response.ok` langsung mengubah UI menjadi generated tanpa membaca envelope/status. Perbaikan menggunakan komponen dan endpoint existing:

- HTTP 2xx saja tidak lagi menampilkan link download. Diperlukan `success: true` dan `data.status: GENERATED`; bila response membawa reportId, nilainya harus sesuai laporan yang sedang ditampilkan.
- Respons PENDING menampilkan "Laporan masih diproses" dan tombol periksa status setelah Retry-After. Tidak ada polling/background scheduler baru; tombol memakai ulang permintaan generate idempotent yang sudah ada.
- Envelope gagal, status tidak dikenal, atau reportId berbeda masuk feedback gagal. Abort, perubahan props, cooldown dan pencegahan permintaan ganda dipertahankan.
- Direktori psikolog tidak lagi mengatakan jadwal/pemesanan belum tersedia; link profil menjelaskan bahwa jadwal ada di halaman detail. Perubahan teks tidak berarti read path DAL lokal telah selesai.
- Enam kasus browser ditambahkan untuk accepted/PENDING lalu GENERATED dan lima bentuk response 200 yang tidak membuktikan artifact siap. Tes existing tidak diubah untuk melemahkan assertion.

Ini menyelesaikan potongan P0-A, **bukan** keseluruhan PDF atau booking. Hasil validasi terarah aktual:

| Pemeriksaan | Hasil | Makna fungsional/batas bukti |
| --- | --- | --- |
| Lima suite report API/service/authorization/Storage/PDF | 52 tes lulus | Kontrak/penolakan existing dan renderer tetap lulus; Storage unit memakai mock, bukan acceptance Storage nyata |
| Browser stability-hotfix dan report-workflow | 29 tes lulus, termasuk 6 kasus baru | PENDING menyembunyikan link, countdown dihormati, retry tidak ganda, GENERATED membuka link, respons tidak valid tidak menghasilkan sukses palsu; harness sintetis localhost |
| TypeScript `tsc --noEmit` | Lulus | Kontrak tipe aplikasi tetap konsisten |
| ESLint tiga berkas yang diubah | Lulus | Tidak ada error/warning pada lingkup perubahan |
| `git diff --check` | Lulus | Tidak ada masalah whitespace tracked |

Percobaan awal tes di sandbox berhenti sebelum eksekusi karena spawn esbuild EPERM. Pengulangan melalui mekanisme approval yang tersedia berhasil; semua angka di atas berasal dari pengulangan tersebut. Bukti: `.tmp/phase4/results.json`, `report-tests.log`, `browser.log`, `tsc.log`, `lint.log`, dan `diff.log`. Diagnostic parser pada tes PDF terpotong adalah bagian kasus negatif existing. Full regression, build, migration, dan rehearsal PostgreSQL/Storage tidak diulang untuk perubahan UI kecil ini.

Berkas Phase 4: laporan ini (baru), `src/components/participant/report-download.tsx`, `src/app/participant/psychologists/page.tsx`, `tests/browser/stability-hotfix.spec.ts`. Delta tiga berkas kode/tes: +59/-12 baris. Perubahan Phase 3 dan draft SQL Stage F bukan hasil Phase 4 dan dipertahankan. Prioritas implementasi berikutnya adalah P0-B/P0-C, dengan titik selesai berupa perjalanan browser lokal yang bekerja, bukan penambahan rehearsal baru.

## Rujukan kode utama

- `src/lib/auth/session.ts`, `src/lib/dal/context.ts`, `src/lib/prisma.ts`, `src/app/api/auth/*`: boundary auth/runtime.
- `src/app/participant/layout.tsx`, dashboard/history/assessment pages, `src/lib/assessment/service.ts`: perjalanan asesmen.
- `src/components/participant/report-download.tsx`, `src/components/reports/file-download.tsx`, `src/lib/reports/{service,pdf,storage}.ts`, report routes: perjalanan PDF.
- `src/lib/psychologist/service.ts`, `src/components/participant/psychologist-availability.tsx`, `src/lib/appointments/{service,runtime}.ts`, AppointmentCenter: direktori, booking, consent.
- `src/components/psychologist/appointment-list.tsx`, `src/components/consultations/{dashboard,chat-panel}.tsx`, `src/lib/consultations/{service,chat-service,policy,chat-policy}.ts`: ruang psikolog/konsultasi.
- `src/components/admin/console.tsx`, `src/lib/admin/service.ts`, admin routes: dashboard operasional.
- `docs/PHASE3-STAGE3E1E-DAL-INTEGRATION.md`: bukti baseline lokal dan batas penerimaannya.

Tidak ada perubahan schema, policy RLS, grants, credential, hosted database, chat/lifecycle produksi, commit, push, atau deploy pada potongan Phase 4 ini. Worktree dari tahap sebelumnya dipertahankan.
