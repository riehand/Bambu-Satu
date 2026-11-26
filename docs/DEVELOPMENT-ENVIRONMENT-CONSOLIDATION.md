# Development environment consolidation

Status keseluruhan: **PARTIAL**. Workflow standar `npm run dev` pada `http://localhost:3000` sudah dipulihkan dan diuji. Integrasi fitur asesmen/PDF/booking dengan hosted masih **BLOCKED** oleh schema, role/gateway, serta integrasi signer/worker yang belum tersedia. PASS lokal Sprint 1–3 tidak dinyatakan sebagai PASS hosted.

## Repository dan perbedaan runtime

Audit dilakukan pada branch `riehand_branch`, HEAD `7b04d2c`. `git worktree list` menunjukkan satu workspace: `D:/TELKOM UNIVERSITY/SEMESTER 7/Capstone/Bambu-Satu`; branch lokal adalah `main` dan `riehand_branch`. Tidak ada worktree atau branch terpisah untuk implementasi Sprint 1–3. Seluruh frontend, route, service, DAL, dan worker sudah berada dalam source utama. Tidak diperlukan merge.

Pada awal pekerjaan, perubahan yang belum tracked adalah `scripts/local-manual.py` dan `docs/LOCAL-MANUAL-TESTING.md` dari pemulihan sebelumnya. Keduanya dipertahankan. Script launcher tidak diubah pada konsolidasi ini; dokumentasinya diperjelas.

| Aspek | Development standar | Acceptance terisolasi |
| --- | --- | --- |
| Perintah | `npm run dev` | `python scripts/local-manual.py start` |
| URL | `http://localhost:3000` | `http://127.0.0.1:55430` |
| Auth | Proyek Supabase dari konfigurasi Next | GoTrue lokal, akun sintetis terpisah |
| Profil | Session Supabase + RLS own-profile existing | Restricted DAL `website_runtime` |
| Fitur klinis database | BLOCKED sampai adapter hosted dan gateway disetujui | Gateway/RLS lokal Sprint 1–3 |
| PDF | BLOCKED: bucket/worker/attestation hosted belum siap | Worker lokal terpisah, private Storage nyata |
| Signer lokal | Tidak diaktifkan | Hanya fixture eksplisit yang divalidasi |
| Output compiler | `.next` | `.next-isolated` |
| Frontend/API/service | Source canonical yang sama | Source canonical yang sama |

Sebelumnya jalur nonlokal masih dapat membuat Prisma client default dari `DATABASE_URL`. Audit konfigurasi menemukan URL tersebut memakai role `postgres`; ini bukan identitas yang boleh menjadi runtime fitur aplikasi. Mengganti port saja tidak menyelesaikan perbedaan ini.

## Perubahan implementasi

1. Script `dev` menggunakan `next dev --hostname localhost --port 3000`. Tidak menjalankan bootstrap Python, tidak mengganti environment ke database sintetis, dan tidak mengaktifkan signer berdasarkan `NODE_ENV=development` saja.
2. Next memakai output `.next-isolated` hanya bila konfigurasi fixture lokal eksplisit ada. Output terpisah mencegah benturan lock/compiler dengan development standar; bukan cabang aplikasi kedua. Git/ESLint mengabaikan output tersebut. Next menambahkan path generated types terkait pada `tsconfig.json`.
3. `getCurrentProfile` tetap memverifikasi pengguna dengan `auth.getUser()` dan email confirmation. Pada development standar, profil dibaca menggunakan client Supabase yang membawa cookie session pengguna dan publishable key. Query memilih delapan kolom profil existing dan membatasi ID ke pengguna terverifikasi. Policy database tetap menentukan row yang dapat dibaca. ID yang tidak cocok, role tidak sah, profil hilang/nonaktif, atau error ditolak. Tidak memakai metadata JWT sebagai role.
4. Adapter profil lokal tetap menggunakan Prisma dalam konteks DAL existing. DTO dan pemeriksaan role/active yang sama dipakai participant, psychologist, dan SUPERADMIN. Tidak ada perubahan aturan bisnis scoring, booking, consent, atau report.
5. Proxy Prisma aplikasi kini menolak `RESTRICTED_RUNTIME_REQUIRED` bila tidak ada adapter restricted yang terpasang; factory owner/default Prisma dihapus. Tidak ada koneksi runtime melalui `DIRECT_URL`, fallback `postgres`, atau cara mengaktifkan adapter hosted hanya dengan mengganti URL.
6. Loader asesmen menjelaskan bahwa layanan belum dikonfigurasi pada environment tersebut, bukan menampilkan hasil/dataset palsu. Startup development mencatat batas runtime tanpa URL/secret. Fitur lain mempertahankan error/unavailable existing saat dependensi tidak tersedia.
7. README dan `.env.example` membedakan konfigurasi website, migration owner, serta worker. Tidak ada isi `.env` atau `.env.local` yang diubah; checksum kedua berkas tetap sama.

Auth/profil standar kini memiliki jalur least-privilege yang tersedia pada hosted. Namun **login hosted dengan akun nyata belum diuji** karena tidak ada akun uji hosted yang diberikan untuk sesi ini. Tidak dibuat akun, dilakukan signup, dipinjam session pengguna, atau dikirim login sintetis ke hosted untuk menghasilkan klaim acceptance.

Pendaftaran baru masih BLOCKED pada standard runtime: preflight NIM/NIP existing menggunakan Prisma yang kini menolak owner fallback. Penyelesaiannya memerlukan mekanisme preflight/onboarding yang disetujui tanpa membuka daftar identitas. Tidak menghapus preflight atau melemahkan kontrak trigger signup sebagai shortcut.

## Inspeksi hosted yang benar-benar dilakukan

`scripts/hosted-compatibility.mjs` memuat konfigurasi dengan prioritas development Next, memastikan URL database cocok dengan project Auth, lalu:

- GET `/auth/v1/settings` memakai public key terkonfigurasi; hasil **200**, email Auth aktif, email confirmation diperlukan.
- Menggunakan transaksi PostgreSQL `READ ONLY`, memverifikasi `transaction_read_only=on`, dan membatasi waktu query.
- Membaca katalog schema/role/policy/trigger, checksum ledger migration, metadata bucket tertentu, dan nama objek untuk koordinasi Flutter.
- Tidak membaca isi `auth.users`, profil pengguna, jawaban, skor, laporan, conversation, message, atau object Storage.
- Tidak menerapkan migration, mengubah grant/policy, membuat bucket, mengubah Auth, atau menulis data hosted.

Credential `postgres` existing digunakan hanya untuk inspeksi katalog read-only yang diminta, tidak menjadi client aplikasi. Output audit tidak mencantumkan URL, password, token, atau record sensitif. Bukti: `.tmp/environment-consolidation/hosted-compatibility.json` dan `hosted-audit.log`.

## Matriks kompatibilitas hosted

| Dependensi | Bukti aktual | Status / dampak |
| --- | --- | --- |
| Konfigurasi proyek | Database URL dan Auth URL mengarah ke project Supabase yang sama | PASS konfigurasi target; tidak dialihkan ke lokal |
| Auth email | Settings HTTP 200; email aktif; autoconfirm false | PASS metadata; login/session aktual belum diverifikasi |
| Profil | `public.users`, RLS aktif, policy `users_read_own_active_profile` | PASS metadata: `auth.uid() = id AND is_active = true` |
| Grant profil | `authenticated` dapat SELECT delapan kolom yang dipakai adapter | Mendukung query profil session-scoped tanpa owner |
| Trigger profil | `wellbeing_auth_user_created` dan `wellbeing_auth_email_changed` aktif | Kontrak existing dipertahankan |
| Ledger website | Dua migration applied; checksum keduanya cocok dengan repository | Enam migration berikutnya belum applied |
| Asesmen | Tabel periode, question sets/questions, sessions, answers, scores, reports tidak ada | BLOCKED |
| Psikolog/booking/consent | Tabel profile profesional, availability, appointment, consultation session, consent/audit tidak ada | BLOCKED |
| Role URL database | `postgres`: BYPASSRLS, CREATEROLE, CREATEDB; owner `public.users` | Tidak boleh dipakai runtime aplikasi; fallback sudah ditolak |
| Role restricted | `website_runtime`, display/scoring/booking/consent/PDF roles tidak ditemukan | BLOCKED |
| Gateway | Tidak ada fungsi pada `wb_guard` / `wb_pdf` | BLOCKED |
| Private Storage | Schema Storage ada, bucket `assessment-reports` tidak ditemukan | BLOCKED; tidak dibuat otomatis |
| Worker | Endpoint worker standard belum dikonfigurasi; role/tabel artifact hosted tidak ada | BLOCKED |
| Signer hosted | Implementasi saat ini hanya installer/claim audience lokal | BLOCKED; HMAC test tidak dipromosikan ke hosted |
| Redirect email/Auth | Konfigurasi allowlist Dashboard Supabase tidak diperiksa melalui API admin | UNVERIFIED; perlu review operator untuk `localhost:3000/auth/confirm` |
| Flutter | Schema `chatbot` berisi `_backend_migrations`, `chat_sessions`, `checkins`, `messages`, `safety_events`, `user_memories` | Tidak dibaca isinya, tidak diubah; schema/ledger terpisah |

Inventory `public` saat audit hanya menemukan `users` dan `_prisma_migrations`. Tidak ada benturan nama dengan tabel website pending yang diperiksa saat ini. Ini bukan persetujuan untuk membuatnya: dependency lintas schema dan kontrak Auth bersama tetap perlu ditinjau bersama tim Flutter sebelum perubahan.

## Rencana perubahan hosted untuk persetujuan

Rencana berikut siap ditinjau ruang lingkupnya, **belum dieksekusi dan bukan persetujuan produksi**. Keputusan signer/custody serta onboarding masih diperlukan sebelum menghasilkan SQL deployment final. Jangan menjalankan draft SQL lokal langsung pada hosted: guard, marker, identitas, dan audience-nya memang lokal.

### 1. Schema website pending

Urutan berkas historis yang belum applied:

| Berkas migration | Ruang lingkup / dependensi |
| --- | --- |
| `20261023010000_phase2_assessment/migration.sql` | Periode, instrumen/question set, sesi/jawaban/skor/report; baseline profil/Auth harus tetap kompatibel |
| `20261028000000_psychologist_profiles/migration.sql` | Profil profesional psikolog |
| `20261029000000_psychologist_availability/migration.sql` | Slot dan constraints jadwal |
| `20261029000001_appointments_report_consent/migration.sql` | Appointment, sesi konsultasi, consent dan audit; bergantung pada schema asesmen/slot |
| `20261120000000_psychologist_profiles_integrity/migration.sql` | Integritas profil psikolog |
| `20261121000000_consultation_messages/migration.sql` | Objek chat; approval schema terpisah dari aktivasi fitur |

Semua berada di `prisma/migrations/`. Dua migration awal yang sudah applied tidak diulang atau diedit. Jangan menjalankan `prisma migrate deploy` sebelum seluruh pending set yang akan diaplikasikan disetujui; perintah itu tidak otomatis berhenti pada subset fitur booking. Pembuatan tabel chat tidak memberikan izin mengaktifkan Human Chat/lifecycle produksi. Tidak ada `db push`, reset, atau manipulasi ledger untuk melewati persetujuan.

Persetujuan yang diperlukan: pemilik database dan lead website untuk additive schema, serta koordinasi Flutter pada shared identity/dependency. Tetapkan scope yang tidak menyentuh `chatbot.*`, ledger Flutter, Auth internals, atau data shared existing. Validasi sesudah penerapan harus mencocokkan checksum migration, constraints/RLS, serta memastikan objek Flutter tetap utuh.

### 2. Identitas runtime, RLS dan gateway

- Siapkan login website least-privilege tanpa ownership, SUPERUSER, BYPASSRLS, CREATEROLE/CREATEDB, atau hak SET ROLE yang memperluas wewenang. Credential owner hanya berada dalam jalur deployment terpisah.
- Review kebijakan/guard dari `docs/sql/stage3e1b/{01-identity,02-runtime-policies,03-mutation-guards,04-monitor}.sql` dan gateway scoring/proyeksi dari `docs/sql/stage3e1c/`. Gunakan sebagai sumber desain, bukan skrip hosted siap jalan.
- Adaptasi subset booking/consent dan proyeksi Sprint 3 (`docs/sql/phase4-sprint3/00..03`) dengan grant kolom/EXECUTE yang sempit. Jangan menambahkan mutation lifecycle/chat ke scope ini.
- Setujui boundary identitas hosted terlebih dahulu: verified Auth subject, transaction binding/freshness, dan signer independen atau desain verifikasi token setara yang ditinjau. Kunci test dalam `.tmp` dan audience `wellbeing-local-runtime-v1` tidak boleh dipakai sebagai signer hosted.
- Setelah database dan signer tersedia, implementasikan adapter hosted di boundary DAL existing sehingga service/UI canonical tetap digunakan. Jangan membuka kembali Prisma owner ketika adapter belum siap/gagal.
- Periksa kebutuhan proyeksi admin: dashboard admin lengkap masih mempunyai batas pada restricted runtime; jangan menjanjikan parity semua fitur hanya karena role SUPERADMIN sudah terautentikasi.

### 3. Storage dan PDF worker

- Persetujuan operator untuk bucket `assessment-reports` **private**, tanpa public URL, dan policy yang sesuai; belum ada bucket pada hasil audit.
- Adaptasi schema/job/ticket/artifact dan finalisasi dari `docs/sql/phase4-sprint2/`, mempertahankan attestation, digest/ukuran, create-only upload, recheck authorization dan audit.
- Pisahkan credential worker database/Storage/signing dari website. `website_runtime` tidak boleh melakukan finalisasi report langsung. Worker hosted belum dapat sekadar menjalankan launcher lokal karena launcher memvalidasi loopback dan database rehearsal.
- Tetapkan endpoint worker terautentikasi dengan transport yang sesuai hosting dan custody secret sebelum mengadaptasi konfigurasi pemanggilan worker. Tidak ada service key yang dikirim ke browser atau ditambahkan ke environment website untuk melewati worker.

### 4. Aktivasi dan acceptance sesudah persetujuan

Operator mengubah credential/configuration secara terpisah setelah review; konsolidasi ini tidak mengubah secret. Perlu approved instrument content/licence, periode dan akun uji hosted, serta redirect allowlist. Acceptance kemudian memakai akun uji yang disetujui untuk login/profil, asesmen resmi, PDF privat, booking, consent dan denial lintas akun. Data sintetis GoTrue lokal tidak disalin ke hosted.

Jika deployment gateway/config gagal, hentikan aktivasi fitur dan pertahankan data; jangan reset database, membuka RLS, menghapus tabel, atau kembali memakai owner runtime. Setiap rollback grant/config harus berada dalam perubahan yang disetujui. Human Chat/lifecycle tetap menunggu keputusan KKA; tidak diaktifkan oleh rencana ini.

## Verifikasi aktual

| Pemeriksaan | Hasil |
| --- | --- |
| `npm.cmd run dev` | PASS: Next.js 16.4.6 memakai `.env.local`/`.env`, URL `http://localhost:3000` |
| Browser Chrome standar | PASS terbatas: halaman login 200, form nyata; participant/assessment/psychologist/admin tanpa session redirect ke login |
| API standar anonim | Quota asesmen, appointment, admin overview: 401 |
| Hosted Auth metadata | PASS: GET settings 200; bukan bukti login end-to-end |
| Hosted login/protected data dengan akun sah | NOT RUN: tidak ada akun uji hosted yang diberikan; tidak memakai mock sebagai acceptance |
| Fitur hosted Phase 4 | BLOCKED berdasarkan katalog aktual dan adapter signer/worker yang belum tersedia |
| Unit/API terarah | PASS: **117 tes, 9 file** — Auth, standard runtime, DAL/local bootstrap, participant boundary, assessment/appointment/admin/psychologist API |
| TypeScript | PASS: `npm.cmd exec -- tsc --noEmit` |
| ESLint akhir | PASS: 0 error; 2 warning `<img>` existing pada landing page |
| Browser stack terisolasi setelah perubahan | PASS: login 200, dashboard, resume draft/1 jawaban persisted, 5 riwayat terlihat, download PDF existing 200 |
| Secret/configuration files | Hash `.env` dan `.env.local` tidak berubah |
| Migration/Flutter | Tidak ada berkas migration atau objek hosted yang diubah |

Tiga belas tes standard runtime baru memeriksa session-scoped profile, identity invalid/missing/inactive/mismatched, otorisasi tiga peran, penolakan metadata role palsu, penolakan proxy Prisma owner sebelum koneksi, dan unavailable asesmen yang jujur. Fixture pada tiga suite existing diarahkan eksplisit ke adapter DAL yang memang diuji; assertion existing tidak dihapus atau dilonggarkan.

Pemeriksaan awal menemukan tipe DTO PostgREST yang terlalu longgar, fixture tes yang masih mengasumsikan Prisma untuk semua mode, serta lint yang ikut memindai output `.next-isolated`. Tipe/fixture/ignore generated output diperbaiki, lalu pemeriksaan terkait lulus. Log `check-results.json` menyimpan lint awal gagal; hasil lint terakhir ada di `lint-final.log`, exit 0. Tidak ada full regression atau rehearsal database baru yang diperlukan untuk perubahan konfigurasi ini.

Bukti berada di `.tmp/environment-consolidation/`: `hosted-compatibility.json`, `standard-dev.log`, `standard-browser-evidence.json`, `standard-login.png`, `targeted.log`, `tsc.log`, `lint-final.log`, dan hash konfigurasi. Browser acceptance lokal tersimpan di `.tmp/local-recovery/browser-evidence.json`. Tidak ada credential disalin ke laporan ini.

## Cara menjalankan dan handover

Development sehari-hari, dari root repository:

```powershell
npm run dev
```

Buka **http://localhost:3000**. Pertahankan terminal selama server dipakai; **Ctrl+C** menghentikannya. Gunakan akun pada proyek Supabase yang terkonfigurasi, bukan akun fixture GoTrue lokal. Login/profile session adapter menggunakan RLS existing; asesmen/PDF/booking belum tersedia pada hosted sampai rencana dependency di atas disetujui dan diimplementasikan. Signup baru juga belum didukung oleh runtime restricted standard saat ini.

Konfigurasi mengikuti prioritas Next: process environment → `.env.development.local` → `.env.local` → `.env.development` → `.env`. Gunakan `.env.example` untuk nama/placeholder saja. Jangan menaruh `WELLBEING_LOCAL_RUNTIME_FILE`, marker rehearsal, atau key HMAC lokal pada konfigurasi development hosted. `DIRECT_URL` tidak pernah menjadi fallback aplikasi. Jangan mengganti secret existing tanpa persetujuan.

Untuk acceptance sintetis opsional:

```powershell
python scripts/local-manual.py start
python scripts/local-manual.py status
python scripts/local-manual.py stop
```

Gunakan **http://127.0.0.1:55430** dan akun fixture lokal. `stop` hanya menghentikan website/worker yang dikelola launcher; `stop-all` juga menghentikan empat container terverifikasi tanpa menghapus volume/data. Lihat [panduan lokal](LOCAL-MANUAL-TESTING.md). Stack test bukan prasyarat membuka aplikasi standar, dan sebaliknya akun hosted tidak ada secara otomatis pada stack lokal.

Inspeksi metadata tambahan dapat dijalankan secara sengaja dengan `node scripts/hosted-compatibility.mjs` oleh operator yang berwenang; script tersebut bukan bagian startup dan tidak memprovisikan apa pun.

Rekomendasi handover: review compatibility matrix bersama pemilik DB/Flutter; setujui scope enam pending migration dan identity/worker design; sediakan akun uji hosted serta konfigurasi least-privilege secara privat; baru lanjutkan adapter hosted dan acceptance nyata. **Tidak memulai Sprint 4.**

## Berkas dan status Git

Perubahan tracked: `.env.example`, `.gitignore`, `README.md`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `src/instrumentation.ts`, `src/lib/{prisma.ts,auth/session.ts,assessment/http.ts}`, `tests/{auth,assessment-api,admin-api}.test.ts`, dan `tsconfig.json`.

Berkas baru konsolidasi: `scripts/hosted-compatibility.mjs`, `tests/standard-runtime.test.ts`, dan dokumen ini. `docs/LOCAL-MANUAL-TESTING.md` yang sebelumnya untracked diperbarui; `scripts/local-manual.py` sebelumnya tetap dipertahankan. Working tree tetap mempunyai perubahan belum commit pada `riehand_branch`. Tidak ada commit, push, merge, reset Git, deployment, perubahan secret, atau hosted write.
