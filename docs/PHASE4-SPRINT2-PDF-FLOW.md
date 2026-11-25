# Phase 4 Sprint 2 — PDF nyata dan Storage privat

Status milestone: **PASS — alur participant melalui browser lokal, 24 November 2026.**

Peserta login melalui GoTrue lokal, membuka hasil asesmen COMPLETED dengan report PENDING, menekan **Buat PDF**, lalu mengunduh PDF nyata dari aplikasi. Object tersimpan pada Supabase Storage privat. Status database berubah menjadi GENERATED setelah worker membaca kembali dan memverifikasi seluruh isi object. Refresh mempertahankan tombol unduh. Status PASS ini hanya untuk integrasi lokal; bukan persetujuan produksi atau bukti custody signer produksi.

## Kondisi awal dan akar hambatan

- Implementasi renderer, Storage create-only, route generate/download, komponen unduh, scoring resmi, dan DAL sudah tersedia. Bagian yang belum aman adalah penghubung runtime least-privilege ke Storage dan finalisasi.
- Pemeriksaan database menemukan `wb_guard.finalize_report` lokal telah menjadi fungsi SECURITY DEFINER yang dapat dipanggil `website_runtime` untuk menetapkan GENERATED hanya dengan report ID/object key. Ini tidak membuktikan adanya PDF. Sprint ini mencabut akses tersebut dan mengembalikan fungsi lama menjadi penolakan; tidak memakai shortcut itu untuk acceptance.
- Download melalui runtime lokal memerlukan akses artifact yang tidak membawa credential Storage ke proses website. Draft Stage 3E.1F belum merupakan implementasi worker yang dapat dijalankan.
- Proyeksi timestamp SQL pada draft menghasilkan waktu tanpa offset. Worker menolak input tersebut dan report tetap PENDING. Adaptasi Sprint 2 menormalisasi timestamp UTC database menjadi ISO dengan akhiran `Z`, sesuai renderer existing.
- Halaman hasil memakai auto-generation sehingga tidak mempunyai tahap eksplisit sebelum klik. Komponen existing sekarang mendukung mode manual; hasil asesmen menggunakan mode ini, sementara default komponen tetap kompatibel dengan pemakai sebelumnya.

## Implementasi dan kode yang digunakan kembali

Alurnya: Results → generate API existing → service/ownership check → DAL bertanda tangan → `wb_pdf.enqueue` → worker lokal terpisah → renderer existing → upload create-only → read-back/digest → `wb_pdf.finalize` → metadata GENERATED → download API existing.

`src/lib/reports/pdf.ts`, `storage.ts`, komponen `reports/file-download.tsx`, scoring, Auth, dan schema Prisma tidak ditulis ulang. API tetap menerima report ID dari path; browser tidak mengirim score, pemilik, key object, atau bytes PDF.

Worker menggunakan role `wb_pdf_worker`, bukan `website_runtime`, `postgres`, atau migration owner. Role worker hanya dapat memanggil gateway yang diperlukan; tidak dapat SELECT/UPDATE tabel reports secara langsung. Tiga role fungsi NOLOGIN memiliki grant/policy terarah untuk membaca input, finalisasi, dan pemeriksaan akses. RLS tetap aktif. SQL baru merupakan adaptasi lokal yang ditinjau; dua draft Stage F asli dipertahankan.

Worker membaca input resmi berdasarkan job yang dibuat untuk participant terautentikasi. Renderer deterministik memungkinkan perbandingan **seluruh bytes** pada retry. Object key tetap `reports/<reportId>.pdf`. Object berbeda tidak ditimpa. Upload yang kehilangan respons hanya boleh dilanjutkan bila read-back membuktikan artifact yang benar.

Attestation mencakup report/session/job, canonical key, bucket, SHA-256, ukuran, nonce, identitas worker, dan kedaluwarsa. Finalizer memeriksa signature, job yang masih berlaku, asosiasi, owner aktif, COMPLETED, score resmi, dan transisi PENDING. Penulisan attestation dan metadata report berlangsung atomik. HTTP 200 worker juga diperiksa kembali terhadap metadata database sebelum service menyatakan GENERATED.

Download memeriksa ownership/consent melalui DAL, mengeluarkan ticket singkat untuk worker, mencocokkan bytes terhadap digest/ukuran database, lalu memeriksa ulang izin setelah I/O Storage. Jalur consent psikolog tetap memeriksa report/session/appointment, pencabutan dan waktu berlaku. Browser menerima bytes melalui route aplikasi; tidak diberikan URL publik permanen.

UI membedakan PENDING tanpa link, tombol Buat PDF, proses permintaan, feedback gagal dengan cooldown/retry, dan GENERATED. Pencegahan request ganda, pembatalan saat unmount/perubahan props, serta koreksi P0-A bahwa HTTP 2xx saja bukan bukti GENERATED tetap dipertahankan. SVG title grafik hasil juga diperbaiki menjadi satu string untuk menghilangkan masalah hydration React.

## Lingkungan dan isolasi

| Komponen | Endpoint/identitas yang diverifikasi |
| --- | --- |
| Next.js nyata | `127.0.0.1:55430`, runtime `website_runtime` |
| Worker terpisah | `127.0.0.1:55440`, role `wb_pdf_worker` |
| PostgreSQL lokal | `wb-sprint1-db`, binding aktual `127.0.0.1:50244 → 5432` |
| Auth/API lokal | `wb-sprint1-kong`, binding aktual `127.0.0.1:50243 → 8000`; GoTrue `wb-sprint1-auth-real` |
| Storage nyata | `wb-sprint1-storage`, storage-api v1.98.5, tanpa port host sendiri |
| Bucket | `assessment-reports`, `public: false` |

Container terkait memiliki label `wellbeing.sprint=phase4-sprint1` dan network `wb-sprint1-loopback`. Volume database `supabase_db_supabase-d55e136c4b` dan Storage `supabase_storage_supabase-d55e136c4b` dipertahankan. Database aplikasi/Auth adalah `wellbeing_phase3_rehearsal`; Storage memakai database lokal `postgres` untuk schema Storage milik layanan. Ini bukan penggunaan login `postgres` oleh aplikasi.

Binding aktual, label, network dan volume diperiksa sebelum tindakan container. Container lama yang memiliki masalah binding tidak diaktifkan. Tidak ada resource Docker lain yang dihapus atau diubah. Pada pengujian gangguan, hanya container Storage yang telah diverifikasi dihentikan sementara dan dijalankan kembali melalui `finally`.

Credential Storage, password role worker, dan key attestation berada pada konfigurasi proses worker lokal yang diabaikan Git. Website memperoleh URL/token worker dan credential `website_runtime`; secret/service-role Storage dikosongkan pada proses website. Bootstrap memvalidasi URL loopback dan role, menolak konfigurasi hosted, dan tidak menyediakan fallback. Identitas admin lokal hanya dipakai untuk provisioning fixture/SQL dan inspeksi bukti; tidak menjadi runtime aplikasi.

Konfigurasi lokal saat verifikasi berada di `.tmp/phase4-sprint1/{runtime-local,browser-local}.json` dan `.tmp/phase4-sprint2/{worker-local,website-worker-local}.json`. Jangan memasukkan isi credential ke Git atau laporan. Launcher worker yang dapat ditinjau adalah `scripts/run-local-pdf-worker.mjs`, dengan `NODE_ENV=test` dan `WELLBEING_PDF_WORKER_FILE` eksplisit. Launcher lokal `.tmp/phase4-sprint2/start.py` menyusun environment proses dari allowlist, bukan menyalin credential hosted.

SQL `docs/sql/phase4-sprint2/00..02` diterapkan hanya pada database fixture yang teridentifikasi. Guard memerlukan nama database, marker rehearsal, dan setting approval lokal. Berkas ini bukan migration hosted dan bukan skrip bootstrap idempotent; jangan menjalankannya kembali secara membabi buta. Delapan checksum migration historis tetap cocok dengan filesystem/database.

## Bukti acceptance browser dan persistence

Browser memakai Next.js nyata dan akun sintetis yang sah melalui GoTrue lokal, bukan mock Auth atau Vite fixture. Sumber fixture adalah report PENDING asli dari asesmen yang sudah diselesaikan; tidak ada seed GENERATED atau reset status untuk membuat tes lulus.

| Langkah | Hasil aktual |
| --- | --- |
| Login → halaman hasil | Profil participant terautentikasi, hasil resmi terlihat |
| Sebelum generate | PENDING terlihat; link unduhan tidak ada |
| Klik Buat PDF | POST generate 200 dengan status GENERATED |
| Database | Report `aa6cfb5b-e024-4402-a55b-c712d6dedd1a` berubah GENERATED |
| Session | `e6c59a1d-e063-4e24-bc2d-94aba96f15eb`, tetap COMPLETED |
| Object privat | `reports/aa6cfb5b-e024-4402-a55b-c712d6dedd1a.pdf` |
| Download aplikasi | HTTP 200; file unduhan browser **17.369 bytes**, satu halaman PDF |
| Isi PDF | ID laporan, DASS-21/WEMWBS, skor **14 / 14 / 14 / 42**, dan keterangan bukan diagnosis terbaca parser PDF |
| Integritas | Unduhan browser sama byte-for-byte dengan object privat dan digest database |
| Refresh | Tombol unduhan tetap tersedia |
| Participant lain | Generate 404 dan download 404 |
| Tanpa login | Download aplikasi 401 |
| Anonymous Storage | Endpoint object publik ditolak dan tidak mengembalikan PDF |

SHA-256 artifact yang diperiksa:

`0caa605575d9aeac46b48c6010ab0d44014846a8c13f79cda2a4bebabad90d6e`

Timestamp finalisasi tersimpan `2026-11-24T15:40:32.660` UTC. Pembuktian unduhan menggunakan event download Playwright dan membaca file yang benar-benar disimpan. Percobaan awal memakai `response.body()` pada respons attachment Chrome menghasilkan buffer kosong meski endpoint 200; tes diperbaiki untuk memeriksa file unduhan aktual, tanpa melonggarkan validasi PDF.

Bukti lokal: `.tmp/phase4-sprint2/browser-evidence.json`, `persistence-evidence.json`, `download.pdf`, `pdf-text.txt`, `pdf-results.png`, `real-browser.log`, dan `isolation.json`.

## Kegagalan, retry, dan pemeriksaan akses

Pengujian browser kedua memakai report PENDING `7ffc96b9-9253-4ee7-a9c7-8fba61d67273`. Saat Storage benar-benar dihentikan, generate mengembalikan 503, UI menampilkan feedback gagal, dan pembacaan session melalui API menunjukkan report masih PENDING dengan asesmen COMPLETED. Download report yang sudah GENERATED juga menghasilkan 503 tanpa bytes PDF. Setelah Storage hidup kembali dan cooldown selesai, klik **Coba lagi** menghasilkan 200 dan metadata GENERATED. Bukti: `recovery-evidence.json` dan `recovery-browser.log`.

Delapan panggilan negatif langsung dengan role lokal menghasilkan SQLSTATE `42501`: interactive UPDATE status, finalizer lama, finalizer worker, worker SELECT langsung, worker UPDATE langsung, job tidak dikenal, ticket tidak dikenal, dan signature attestation tidak valid. UPDATE pengujian memakai `WHERE false` sehingga tidak mengubah baris sekalipun terjadi kesalahan konfigurasi. Pemeriksaan privilege katalog juga menunjukkan tidak ada hak tersebut dan worker tidak mempunyai BYPASSRLS. Bukti: `denial-evidence.json`.

Tes unit terarah meliputi upload gagal, respons upload hilang, kegagalan finalisasi setelah object tersimpan dan retry tanpa overwrite, duplicate in-flight, artifact konflik meski metadata PDF terlihat benar, job/ticket tidak valid atau kedaluwarsa, object hilang/rusak, serta download dengan digest yang sesuai. Kasus-kasus fault injection unit ini menggunakan mock dan **tidak** diklaim sebagai pengujian gangguan database atau penghapusan object pada Storage nyata. Tidak ada penghapusan/retensi baru.

## Validasi

| Pemeriksaan | Hasil |
| --- | --- |
| Enam suite report/PDF/Storage/worker terarah | **PASS**, 64 tes |
| Browser Next.js + GoTrue + Storage nyata | **PASS**, generate/download/refresh/penolakan akses |
| Browser gangguan Storage nyata | **PASS**, 503 → tetap PENDING → retry GENERATED |
| Penolakan PostgreSQL lokal | **PASS**, 8 panggilan ditolak |
| `npm.cmd test` setelah milestone | **PASS**, 579 tes / 37 file |
| `npm.cmd run test:browser -- --reporter=list` | **PASS**, 126 tes harness sintetis existing |
| `npm.cmd exec -- tsc --noEmit` | **PASS** |
| `npm.cmd run lint` | **PASS**, 0 error; dua warning `<img>` existing di `src/app/page.tsx` |
| `npm.cmd run build` | **PASS**, build Next.js 16.4.6 selesai termasuk typecheck, prerender dan optimasi route |
| `git diff --check` | **PASS**; pemberitahuan konversi LF/CRLF pada beberapa berkas existing |
| Migration historis | **PASS**, delapan checksum tidak berubah |

Regresi penuh dijalankan sekali setelah alur nyata dan retry berhasil. Semua URL/credential pada proses regresi/build dioverride dengan nilai sintetis loopback; fixture runtime/worker dikosongkan. Next mencantumkan nama `.env`/`.env.local` dalam log build, tetapi nilai koneksi proses memakai override tersebut. Tidak ada hosted Supabase yang digunakan. Seluruh rehearsal PostgreSQL 137 kasus tidak diulang. Log pemeriksaan ada di `.tmp/phase4-sprint2/full-*.log` dan `milestone-results.json`.

TypeScript terarah pertama menemukan literal BigInt yang tidak sesuai target ES2017; telah diganti `BigInt(1000)` di tes, dan pemeriksaan penuh berikutnya lulus. Tidak ada assertion yang dikurangi atau tes existing yang dihapus.

## Berkas yang berubah pada Sprint 2

| Berkas | Perubahan |
| --- | --- |
| `src/lib/reports/service.ts` | Delegasi gateway lokal ke worker; menolak finalisasi interactive lama |
| `src/lib/reports/runtime.ts` (baru) | Enqueue, pemanggilan worker, pemeriksaan metadata, authorization sebelum/sesudah download |
| `src/lib/reports/worker.ts` (baru) | Render resmi, create-only upload, verifikasi bytes, attestation dan download |
| `src/lib/reports/local-worker-server.ts` (baru) | Proses HTTP loopback dengan identitas worker terpisah |
| `scripts/run-local-pdf-worker.mjs` (baru) | Launcher memakai bundler existing, tanpa paket baru |
| `src/app/api/reports/[reportId]/download/route.ts` | Integrasi jalur worker dengan kontrak download existing |
| `src/components/participant/report-download.tsx` | Mode Buat PDF manual, feedback dan retry tetap dipertahankan |
| `src/components/participant/results.tsx` | Mode manual pada hasil dan perbaikan SVG title |
| `tests/report-worker.test.ts` (baru) | 12 kasus worker/failure/integritas |
| `tests/report-pdf.test.ts` | Pembuktian renderer deterministik, seluruh assertion existing dipertahankan |
| `tests/local-website/pdf-generation.spec.ts` | Acceptance actual download, refresh, cross-user, anonymous Storage |
| `tests/local-website/pdf-recovery.spec.ts` (baru) | Storage interruption dan retry nyata |
| `docs/sql/phase4-sprint2/00-close-interactive-finalizer.sql` (baru) | Penutupan shortcut interactive lokal |
| `docs/sql/phase4-sprint2/01-authorities.sql` (baru) | Identitas, grant, policy, job/ticket/attestation lokal |
| `docs/sql/phase4-sprint2/02-gateways.sql` (baru) | Gateway lokal yang sudah ditinjau dan diuji |
| `docs/PHASE4-FEATURE-GAP-ANALYSIS.md` | Catatan kemajuan P0-C dan rujukan bukti |
| `docs/PHASE4-SPRINT2-PDF-FLOW.md` (baru) | Laporan ini |

Branch tetap `riehand_branch`. Worktree sudah berisi banyak perubahan tracked/untracked dari Phase 3, Phase 4 awal, dan Sprint 1. Daftar di atas adalah delta Sprint 2, bukan klaim kepemilikan seluruh `git diff`. Snapshot hash awal berada di `.tmp/phase4-sprint2/baseline-hashes.json`; enam berkas kode/tes existing berubah terhadap snapshot, dan tidak ada berkas snapshot yang hilang. Perubahan generate-route wrapper, Auth/DAL, participant pages, `tsconfig.json`, serta berkas lama lain dipertahankan. Tidak ada perubahan package/lockfile, schema Prisma, migration historis, objek Flutter, atau secret environment existing. Tidak ada commit, push, merge, deployment, atau aktivasi chat/lifecycle produksi.

Ringkasan `git diff --stat` tracked akhir: **27 file, +274/-47 baris**, termasuk perubahan tahap sebelumnya. Berkas untracked tidak tercakup angka itu. Delta Sprint 2 yang dicantumkan di atas mencakup **17 berkas**: tujuh perubahan kode/tes/dokumen existing dan sepuluh berkas baru. Artefak operasional/bukti `.tmp` tetap lokal dan diabaikan Git.

## Risiko tersisa dan batas penerimaan

- Worker, website, dan file credential masih berada pada mesin/akun OS lokal yang sama. Pemisahan proses dan role sudah diuji; custody signer independen produksi **belum** ditetapkan atau disahkan.
- Report GENERATED lama yang dibuat sebelum Sprint 2 tanpa attestation tidak otomatis dipercaya oleh gateway download baru. Data tersebut tidak direset, dimigrasikan, atau dihapus. Jalur pemulihan metadata lama membutuhkan keputusan tersendiri.
- Tes browser Sprint ini menerima perjalanan participant. Download psikolog dengan consent, revoke saat I/O, dan booking lintas kedua peran masih memerlukan acceptance browser lokal pada sprint fitur terkait; tidak diklaim selesai oleh tes participant ini.
- Job/ticket memiliki expiry, tetapi tidak ada kebijakan pembersihan otomatis. Tidak ditambahkan retensi/deletion tanpa persetujuan.
- Kegagalan database tepat setelah upload, konflik object dan object hilang dicakup tes unit; gangguan Storage nyata dicakup browser. Jangan menyamakan kedua tingkat bukti tersebut.
- Konfigurasi worker ini dibatasi lokal dan bukan deployment produksi. Penyelesaian P0-C membuka dependensi untuk booking/consent lokal berikutnya; Sprint 3 tidak dimulai otomatis.
