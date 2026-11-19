# Stage 2B.1 — PDF workflow dan akses psikolog

Implementasi dan validasi lokal saja. Tidak ada koneksi pengujian ke Supabase hosted, perubahan resource hosted, migrasi yang diterapkan ke database aplikasi, commit, push, atau deployment.

## Temuan dan penggunaan kembali

- Generator yang ada mengambil skor kanonis dari asesmen COMPLETED yang tersimpan. Jalur laporan tidak menulis jawaban atau skor.
- Upload memakai key deterministik dan `upsert: false`. Read-back memverifikasi PDF yang diharapkan sebelum conditional update PENDING → GENERATED. Retry PENDING dapat memulihkan objek valid yang sudah tersimpan tanpa menimpanya.
- Throttle bersifat per proses; ketepatan hasil concurrent request bergantung pada create-only upload dan conditional update, bukan throttle. Tes mock mencakup overlap setelah jendela throttle dan finalisasi oleh request lain.
- Download sudah memeriksa ownership/consent sebelum membaca Storage dan memeriksanya ulang sesudah verifikasi artefak. Alur ini dipertahankan.
- Celah UI terkonfirmasi: psikolog tidak memiliki aksi laporan di daftar janji, sedangkan tautan unduh peserta dapat menavigasi ke JSON error.

## Perubahan dan alur

- Daftar janji memakai DTO `reportAccess` minimal dan evaluator grant yang juga dipakai endpoint laporan. DTO tidak memuat skor, ID consent, atau path Storage. Tidak ada audit akses hanya karena daftar ditampilkan.
- Grant harus cocok dengan participant, assessment, report, dan psychologist. Grant appointment juga harus cocok dengan appointment, belum revoked/expired, belum melewati waktu akhir, dan sesi/janjinya belum terminal. Standalone tanpa appointment dan tanpa expiry dievaluasi independen sesuai kontrak lama.
- Aksi psikolog memakai endpoint download yang ada dengan `appointmentId`. Server memeriksa association dua kali, termasuk setelah read-back Storage. Role psikolog saja tidak cukup.
- Peserta mempertahankan workflow generation Stage 2A. Peserta dan psikolog memakai aksi download bersama: fetch same-origin tanpa cache, validasi MIME/signature/EOF PDF, gunakan nama dari Content-Disposition yang aman, lalu download Blob. JSON error tidak ditampilkan atau dinavigasi.
- Error menggunakan pesan aman dan aksi retry. Request ganda dicegah; unmount/pergantian identitas membatalkan request serta mengabaikan respons terlambat. Blob URL dibersihkan setelah 60 detik atau saat unmount. Verifikasi penuh isi/identitas PDF tetap di server.

## Batas pemulihan GENERATED

Status GENERATED tidak otomatis berarti objek masih ada di Storage pada waktu unduh. Objek hilang, rusak, key tidak cocok, atau Storage tidak tersedia menghasilkan error aman. Tombol retry hanya mengulangi download; tidak meregenerasi, menghapus, atau menimpa objek GENERATED.

Desain lanjutan terkecil yang memerlukan persetujuan kebijakan terpisah:

1. Diagnosis administratif terbatas dan diaudit, berdasarkan metadata serta skor kanonis; jangan menyediakan repair lewat endpoint download.
2. Untuk objek yang benar-benar hilang, pertimbangkan pemulihan create-only dari template versi yang sesuai ke key yang sama, disertai verifikasi fingerprint/read-back dan audit, tanpa mengubah skor atau metadata GENERATED. Ini belum diimplementasikan.
3. Untuk objek yang ada tetapi rusak, hentikan pemulihan otomatis. Penggantian memerlukan kebijakan versioning/retensi dan audit yang disetujui sebelum mengubah aturan key atau metadata. Tidak ada overwrite/delete diam-diam.

## Batas bukti dan verifikasi manual selanjutnya

- Tes service/API memakai Prisma dan Storage mock; browser memakai harness Vite terisolasi dengan fixture sintetis. Tes database yang sudah ada memakai PGlite in-memory.
- Tes tersebut tidak membuktikan deployment, konektivitas, privilege, atau konfigurasi Supabase hosted.
- Perlu verifikasi manual terpisah pada lingkungan yang disetujui: bucket `assessment-reports` benar-benar private; anon/authenticated tidak dapat melewati endpoint aplikasi untuk membaca objek; credential server tersedia hanya di server; hak create-only/read dan respons konflik Storage sesuai kontrak; schema, constraint, trigger immutable, dan audit yang diharapkan memang terpasang; unduhan/revocation/expiry dan concurrency lintas instance bekerja dengan Storage/database nyata.
- File yang sudah selesai diunduh tidak dapat ditarik kembali oleh revocation. Authorization berlaku pada batas pemeriksaan server sebelum respons dikirim.
- Infrastruktur hosted tidak diperiksa atau diubah pada tahap ini; tidak ada klaim siap produksi.

## Validasi lokal — 19 November 2026

| Perintah | Hasil aktual |
| --- | --- |
| `npm.cmd test` | 354/354 lulus, 26 file; bertambah 36 tes |
| `npm.cmd exec -- tsc --noEmit` | Lulus |
| `npm.cmd run lint` | Lulus, 0 error; 2 warning lama `next/no-img-element` di `src/app/page.tsx` |
| `npm.cmd run test:browser -- --reporter=list` | 82/82 lulus; bertambah 11 tes; seluruh regresi Stage 2A dipertahankan |
| `npm.cmd run build` | Lulus pada pengulangan, 33 halaman berhasil dibuat; memakai URL database lokal yang tidak dapat terhubung dan kredensial placeholder |
| `git diff --check` | Lulus |

Percobaan Vitest awal tertahan `spawn EPERM` karena sandbox membatasi child process esbuild; pengulangan dengan izin proses lokal lulus. Build pertama selesai kompilasi tetapi exit 1 akibat `SecurityFatalError`/pengingat keamanan Next.js. Pengulangan exit 0 tetap menampilkan peringatan keamanan versi framework. Tidak ada upgrade dependency; tindak lanjut keamanan versi berada di luar implementasi ini.

Tes baru mencakup DTO tanpa data sensitif, seluruh asosiasi grant, tanpa consent/revoked/expired, terminal lifecycle, standalone independen, role tidak sah, pemeriksaan ulang setelah Storage, artefak hilang/rusak, skor persisted, concurrent finalization, download sukses/gagal/retry, nama file dan byte PDF, duplicate click, pergantian props, unmount, serta cleanup Blob URL. Tes lama hanya dilengkapi field scope fixture yang memang ada pada row Prisma; assertion tidak dilemahkan.
