# PROGRESS-FASE3

**Pembaruan:** 29 Oktober 2026  
**Branch:** `Phase3`  
**Baseline HEAD:** `052c603`  
**Status publikasi:** Perubahan B1 masih lokal; belum di-commit, di-push, atau di-deploy.

## Ringkasan Status

- **B1 — Profil psikolog dan direktori peserta: selesai lokal.** Psikolog mengelola profil sendiri; peserta terautentikasi dapat melihat direktori dan detail psikolog aktif.
- **B2 — Ketersediaan psikolog: berikutnya.** Belum ada model, migrasi, API, atau UI ketersediaan.
- **Booking + consent laporan: direncanakan setelah B2.** Belum ada appointment, consent berbagi, maupun akses laporan psikolog.
- **Chatbot, PDF privat, chat konsultasi manusia, dan dashboard Super Admin: belum dikerjakan dalam irisan ini.** Consent/handoff Chatbot menunggu persetujuan bersama.

## Checklist Phase 3

- [x] B1 — Profil psikolog dan direktori peserta.
- [ ] B2 — Ketersediaan psikolog.
- [ ] Booking appointment + consent laporan terikat appointment + akses laporan terbatas.
- [ ] No-show 15 menit + reschedule sebagai pemulihan.
- [ ] PDF laporan privat.
- [ ] Chat konsultasi manusia.
- [ ] Fitur Super Admin sesuai scope yang disetujui.
- [ ] Chatbot — menunggu persetujuan bersama untuk consent/handoff.

## Pekerjaan B1 yang Sudah Ada

- Model Prisma `PsychologistProfile` dan migrasi additive `20261028000000_psychologist_profiles`.
- API psikolog untuk membaca/memperbarui profil sendiri serta API peserta untuk direktori dan detail profil.
- UI profil mandiri di `/psychologist/dashboard`, direktori peserta di `/participant/psychologists`, detail profil, dan navigasi peserta.
- Proteksi role, ownership dari sesi Supabase terverifikasi, validasi allowlist, respons `private/no-store`, dan pemilihan kolom publik tanpa email/telepon/ID institusi.
- Migrasi mengaktifkan RLS dan mencabut akses tabel langsung dari `PUBLIC`, `anon`, serta `authenticated`.

## Keputusan Phase 3 yang Sudah Disepakati

- Slot konsultasi tetap dua jam: **MORNING 09.00–11.00**, **AFTERNOON 13.00–15.00**, **EVENING 16.00–18.00**. Gunakan waktu Jakarta (`Asia/Jakarta`), dengan waktu API ber-offset `+07:00`; jangan menambah slot waktu bebas.
- Peserta memilih psikolog sendiri. Slot tersedia yang berhasil dipesan langsung menjadi `CONFIRMED`; tidak ada persetujuan psikolog tahap kedua.
- Consent pemrosesan asesmen tidak mengizinkan berbagi laporan. Consent laporan psikolog diberikan secara eksplisit saat booking, tidak tercentang sebelumnya, dan terikat pada satu appointment, satu psikolog, serta laporan yang bersangkutan.
- Grant, revoke, dan akses laporan sensitif diaudit tanpa menaruh isi laporan/skor, jawaban, token, atau data sensitif di log. Revoke langsung memblokir akses berikutnya. Peserta boleh memberi consent lagi secara eksplisit selama sesi/appointment belum berakhir; setiap grant/revoke tetap tercatat. Salinan yang telah diunduh tidak dapat ditarik kembali.
- No-show psikolog memakai ambang 15 menit. Penjadwalan ulang hanya pemulihan dari sesi gagal/no-show, bukan follow-up otomatis.
- Consent kontak tetap terpisah dan baru diperlukan jika informasi kontak peserta benar-benar digunakan. Consent/handoff Chatbot ditunda sampai ada persetujuan bersama.
- Profil psikolog dikelola sendiri. Hanya akun psikolog aktif yang tampil; tidak ada alur persetujuan profil oleh Super Admin dalam scope ini.

## Roadmap Berikutnya

| Urutan | Workstream | Isi utama | Ketergantungan / batas |
| --- | --- | --- | --- |
| 0 | Penutupan B1 | Pertahankan catatan API, migrasi, hasil validasi; browser suite penuh perlu dijalankan kembali setelah masalah runner selesai ditangani. | Perbaikan catatan waktu/slot telah diselaraskan dengan keputusan di atas. |
| 1 | B2 — Availability | Model dan constraint unik psikolog/tanggal/jenis sesi; API psikolog mengelola availability; API peserta hanya menampilkan slot tersedia; UI kalender/pemilihan tanggal. | Tidak membuat booking. Slot yang sudah `BOOKED` tidak dapat dibuka kembali melalui update availability biasa. |
| 2 | Booking + consent + akses laporan | `POST /api/appointments` memvalidasi peserta, asesmen/laporan selesai dan milik peserta, psikolog aktif, slot tersedia, serta consent eksplisit. Transaksi membuat appointment `CONFIRMED`, menandai slot `BOOKED`, membuat consultation-session, mencatat consent dan audit. Tambahkan appointment list/detail, report JSON terbatas, consent list/revoke, serta grant ulang eksplisit untuk appointment aktif. | Bergantung pada B2. Akses laporan hanya untuk pemilik atau psikolog appointment dengan consent aktif. PDF privat tidak termasuk; tidak mengekspos kontak peserta tanpa consent kontak terpisah. |
| 3 | No-show dan reschedule recovery | Terapkan status no-show pada ambang 15 menit, tampilkan tindakan reschedule, dan pertahankan jejak appointment asal pada transaksi reschedule. | Tidak membuat follow-up otomatis. Kebijakan pembatalan umum dan endpoint pembatalan tidak ditambahkan tanpa persetujuan kebijakan. |
| 4 | Workstream Phase 3 berikutnya | PDF privat, chat konsultasi manusia, serta fitur Super Admin sesuai scope yang disetujui. | Chat manusia bergantung pada appointment/session; integrasi Chatbot tetap menunggu persetujuan bersama. |

## Bukti Validasi B1

- `npm.cmd test`: 255 tes lulus dalam 15 file. Setelah penyesuaian akhir SQL migrasi, 25 tes terfokus lulus, termasuk tes API, service, backup-layout, dan PGlite migrasi.
- `npm.cmd exec -- tsc --noEmit`: lulus. Perubahan tipe-only pada `tests/phase2-backup-layout.test.ts` menghilangkan error typing yang sudah ada tanpa mengubah perilaku tes.
- `npm.cmd run lint`: 0 error; 2 warning `<img>` lama di `src/app/page.tsx`.
- `prisma validate`: lulus.
- `npm.cmd run build`: lulus dengan Next.js 16.4.2 dan mendaftarkan route B1.
- `npm.cmd run test:browser`: run penuh melaporkan 52 dari 53 skenario lulus sebelum fixture asesmen sintetis tidak menemukan `.wb-app` pada lebar 768 px. Skenario tersebut lulus saat dijalankan tersendiri; runner Playwright/Vite tertahan setelah tes terakhir dan dihentikan, sehingga run penuh belum berakhir bersih. Suite ini tidak menguji halaman B1 terautentikasi.

Seluruh data pengujian bersifat sintetis dan tes database memakai PGlite lokal. Migrasi B1 belum diterapkan ke Supabase hosted/shared; perilaku hosted belum diverifikasi. Instalasi dependency juga melaporkan 3 temuan audit (1 moderate, 2 critical); tidak ada dependency yang diubah dalam workstream B1.

## Batas Operasional

- Migrasi Phase 3 berikutnya harus additive, ditinjau, dan diuji pada database development terisolasi.
- Jangan mengubah migrasi lama, menjalankan `db push`/reset, mengubah grants/RLS hosted, atau menerapkan migrasi hosted tanpa persetujuan terpisah.
- Jangan commit atau push otomatis. Status B1 di atas adalah status worktree lokal, bukan klaim bahwa perubahan sudah dipublikasikan.
