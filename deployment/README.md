# Preview aplikasi

Konfigurasi Vercel dan urutan staging untuk release candidate: [RELEASE-CANDIDATE.md](RELEASE-CANDIDATE.md). `vercel.json` menonaktifkan deployment Git otomatis sampai ada instruksi deployment, termasuk sesudah push yang disetujui. Build hanya generate Prisma Client dan compile Next.js; tidak menjalankan migration.

Persiapan konfigurasi saja; belum ada deployment. Source aplikasi tetap `src/` yang sama dengan development dan pengujian lokal. `preview.env.example` adalah template tanpa credential.

Topologi: browser → HTTPS reverse proxy → Next.js → Supabase Auth dengan session pengguna. Jalur klinis berikutnya: Next.js → DAL restricted dengan identitas terverifikasi → gateway PostgreSQL. Worker PDF merupakan service terpisah dengan credential terbatas dan private Storage; tidak memakai credential worker pada browser atau proses website.

Setelah target preview disetujui, operator menempatkan public configuration saat build dan secret server melalui pengelola secret target. Gunakan `npm ci`, `npm run build`, kemudian `npm exec -- next start --hostname 127.0.0.1 --port 3000` di belakang reverse proxy pada host yang sama. Hosting terkelola menggunakan konfigurasi listener platform. SITE_URL dan redirect `/auth/confirm` harus sesuai origin HTTPS preview. Jangan memakai `.env.local` milik developer sebagai paket deployment. Jangan menjalankan migration otomatis dalam build/start.

Preview UI/Auth tidak berarti fitur klinis hosted siap. Dependensi sebelum acceptance hosted: enam migration website yang sudah dirinci dalam [compatibility report](../docs/DEVELOPMENT-ENVIRONMENT-CONSOLIDATION.md), role/RLS/gateway restricted, adapter identitas hosted dan signer yang disetujui, bucket privat, worker PDF, materi instrumen/periode, dan akun uji yang disetujui. Tidak ada fallback owner atau test signer. Signup memerlukan preflight identitas institusional yang tersedia dengan hak terbatas.

Tetap nonaktif: human chat/lifecycle produksi, perubahan role/aktivasi akun, aktivasi periode dan perubahan kuota produksi, ekspor audit/data, serta AI handoff sampai kebijakan KKA dan gateway terkait disetujui. Kode UI menampilkan keterbatasan ini tanpa data fiktif.

Sebelum deployment yang diinstruksikan: satu full regression milestone, build production, dan acceptance dengan akun preview yang disetujui. Untuk kembali ke versi sebelumnya, gunakan artifact aplikasi sebelumnya; jangan reset database atau menghapus volume. Deployment tidak dijalankan oleh perubahan ini.

Implementasi staging terbaru dan langkah Dashboard: [STAGING-FIRST-TIME.md](STAGING-FIRST-TIME.md). Belum ada deployment hosted.
