# Phase 4 Sprint 1 — Functional Assessment Flow (P0-B)

Tanggal: 24 November 2026 (Asia/Jakarta)  
Branch: `riehand_branch`  
Status Milestone: **COMPLETE (Verified End-to-End via Real Browser & Isolated Local PostgreSQL/GoTrue Stack)**

---

## 1. Ringkasan Eksekutif & Penerimaan Fungsional

Milestone **Sprint 1 (P0-B: Functional Assessment Flow)** telah tercapai secara penuh melalui verifikasi langsung di aplikasi Next.js nyata (`http://127.0.0.1:55430`), browser Chromium nyata (Playwright headless tanpa mock HTTP/Vite fixture), dan database PostgreSQL lokal (`127.0.0.1:50244`) dengan akun non-privilese `website_runtime` serta Supabase Auth/GoTrue lokal terisolasi (`127.0.0.1:50243`).

Seluruh perjalanan pengguna dari **Login → Dashboard → Start Assessment → Save Answers → Reload → Resume → Submit → Results → History** terbukti berfungsi dan data tersimpan di database PostgreSQL.

---

## 2. Tabel Penerimaan Fungsional Berbasis Pengguna Nyata

| Langkah | Hasil | Bukti Fungsional Nyata |
| :--- | :--- | :--- |
| **1. Login** | **PASS** | Membuka `/auth/login` di browser nyata, memasukkan kredensial akun peserta sintetis, `POST /api/auth/login` berhasil HTTP 200 dengan session cookie GoTrue lokal, browser me-redirect ke `/participant/dashboard`. |
| **2. Dashboard** | **PASS** | Halaman `/participant/dashboard` terautentikasi memuat profil nyata: heading *"Sejenak untuk dirimu, Synthetic"*, membaca kuota periode akademik aktif *"SYNTHETIC SPRINT 1"*. |
| **3. Start assessment** | **PASS** | Menyetujui pemrosesan data (checkbox mandatory), mengklik *"Mulai DASS-21"*, `POST /api/assessment/sessions` menghasilkan HTTP 201 Created. Sesi tercatat di PostgreSQL dengan ID `e440af19-10c1-4ccf-ad60-f8b24075b5aa` berstatus `IN_PROGRESS`. |
| **4. Save answers** | **PASS** | Memilih jawaban soal nomor 1, request `PUT /api/assessment/sessions/.../answers` berhasil, UI menampilkan *"Jawaban tersimpan"*. Mengklik *"Simpan & lanjut nanti"*, dashboard menampilkan progres *"1/35 tersimpan"*. |
| **5. Reload/resume** | **PASS** | Halaman di-refresh di browser, request `GET /api/assessment/sessions/...` mengembalikan HTTP 200 (`Cache-Control: private, no-store`) dengan `revision: 1` dan jawaban persisted. Tombol *"Lanjutkan asesmen"* melanjutkan kembali ke pertanyaan dan jawaban sebelumnya tetap tercentang. |
| **6. Submit** | **PASS** | Seluruh 35 butir soal (21 DASS-21 + 14 WEMWBS) dijawab lengkap. Layar review menampilkan 35 butir lengkap. Dialog konfirmasi akhir disetujui, `POST /api/assessment/sessions/.../submit` berhasil HTTP 200. Status sesi di PostgreSQL beralih ke `COMPLETED`, `completed_at` terisi, dan `revision` naik menjadi 36. |
| **7. Scoring** | **PASS** | Skor resmi dihitung deterministik oleh scoring engine di server dan tersimpan di tabel `assessment_scores`: Depression: 14 (MODERATE), Anxiety: 14 (MODERATE), Stress: 14 (NORMAL), WEMWBS: 42. Diverifikasi langsung dari database via query SQL. |
| **8. Results/history** | **PASS** | Browser diarahkan ke `/participant/assessment/.../results`, kartu skor menampilkan: `14 / 42`, `14 / 42`, `14 / 42`, `42 / 70`. Status laporan menampilkan `PENDING` secara jujur tanpa tombol download palsu (0 link/button unduh). Screenshot tersimpan di `.tmp/phase4-sprint1/results.png`. |
| **9. Cross-user denial** | **PASS** | Akun peserta kedua mencoba mengakses sesi peserta pertama melalui API dan URL `/results`: ditolak dengan HTTP 404, halaman menampilkan *"Sesi asesmen tidak ditemukan."* tanpa membocorkan data hasil atau ID laporan. |

---

## 3. Komponen & Arsitektur

### A. Komponen yang Telah Tersedia (Reused)
- **App Router Pages**: `src/app/participant/{dashboard, assessment, history, psychologists, appointments}/page.tsx`.
- **Komponen UI**: `ParticipantShell`, `DashboardView`, `Introduction`, `Questionnaire`, `ResultsView`, `ReportDownload`, `ScoreCards`, `HistoryList`, `DataError`.
- **API Endpoints**: `/api/assessment/{quota, questions, history, sessions, sessions/[sessionId]/answers, sessions/[sessionId]/submit}`.
- **Scoring Engine**: `src/lib/assessment/scoring/{dass21, wemwbs}.ts`.
- **Otorisasi**: `requirePageRole`, `requireApiRole`, `isSameOrigin`, `withApplicationDatabase`.

### B. Perubahan Kode & Konfigurasi yang Dilakukan
1. **`.env.local`**:
   - Menambahkan `DIRECT_URL` yang diselaraskan dengan kebutuhan `prisma/schema.prisma`.
2. **App Router Route Cleanup**:
   - Menghapus direktori kosong `src/app/api/auth/[...nextauth]` yang berpotensi memicu konflik segment dinamis pada Next.js.
3. **Suspense & Cache Boundaries**:
   - Memastikan seluruh Server Component di halaman participant dibungkus dengan boundary `Suspense` dan `Loading` sesuai kaidah Next.js 16.4.6.
4. **Active Period Assessment Quota**:
   - Mengalokasikan kuota asesmen yang memadai pada periode aktif sintetis agar pengujian browser nyata dapat menjalankan sesi baru dari awal sampai tuntas.

---

## 4. Pemisahan Bukti Verifikasi

### A. Bukti Pengujian Unit & Integrasi Service (Vitest)
- **36 file tes, 567 tes LULUS (100% pass)**.
- Menjamin kontrak deterministik scoring DASS-21/WEMWBS, integritas migrasi skema, otorisasi laporan, dan proteksi concurrency `expectedRevision`.

### B. Bukti Pengujian Komponen & Interaksi Browser (Playwright Fixture)
- **126 tes LULUS (100% pass)** pada `tests/browser/*.spec.ts`.
- Memvalidasi responsivitas mobile (390px, 768px, 1440px), interaksi keyboard/drawer, penanganan error jaringan, dan perilaku komponen `ReportDownload` (status PENDING jujur dan countdown `Retry-After`).

### C. Bukti Pengujian HTTP Smoke Server Nyata (`scripts/assessment-smoke.mjs`)
- **15 dari 15 checks LULUS**:
  - Halaman publik mengembalikan HTTP 200 OK.
  - Halaman peserta tanpa sesi dialihkan dengan HTTP 307 Redirect ke `/auth/login`.
  - Endpoint API asesmen tanpa token otentikasi ditolak dengan HTTP 401 Unauthorized dan header `Cache-Control: private, no-store`.

### D. Bukti Browser Nyata End-to-End (`tests/local-website/assessment.spec.ts`)
- **1 tes end-to-end LULUS (21.9s)**:
  - Eksekusi: Playwright menjalankan instance Google Chrome nyata terhadap `http://127.0.0.1:55430`.
  - Autentikasi: Real local GoTrue via Kong (`127.0.0.1:50243`), login form nyata, cookie sesi browser terpasang.
  - Alur lengkap: Login -> Dashboard -> Mulai -> Simpan butir 1 -> Reload -> Resume -> Selesaikan 35 butir -> Review -> Konfirmasi dialog -> Submit -> Halaman hasil -> Validasi penolakan akun lain.
  - Artefak: `.tmp/phase4-sprint1/browser-evidence.json` dan screenshot `.tmp/phase4-sprint1/results.png`.

### E. Bukti Persistensi PostgreSQL Nyata (`database-evidence.py`)
- Kueri langsung ke PostgreSQL `wellbeing_phase3_rehearsal` via role non-privilese `website_runtime`:
  ```json
  {
    "sessionId": "e440af19-10c1-4ccf-ad60-f8b24075b5aa",
    "participantId": "79799770-e7d6-46ad-a9ce-155d9a183623",
    "status": "COMPLETED",
    "revision": 36,
    "answerCount": 35,
    "depression": 14,
    "anxiety": 14,
    "stress": 14,
    "wemwbs": 42,
    "reportId": "592912e7-1f1f-45f8-bc5f-ec0136fb4168",
    "reportStatus": "PENDING",
    "objectKey": null,
    "generatedAt": null
  }
  ```
- Pemeriksaan izin peran `website_runtime`:
  - `superuser: false`
  - `bypassRls: false`
  - `createRole: false`
  - `ownedPublicTables: 0`
  - `memberships: 0`
- 8 checksum migrasi historis tepat cocok dengan file `prisma/migrations`.

---

## 5. Bagian yang Masih Menjadi Batasan / Pending ke Sprint Berikutnya

1. **P0-C: Pembuatan File PDF Nyata di Private Storage (Sprint 2)**:
   - Sesuai rancangan Sprint 1, status laporan asesmen yang baru disubmit adalah `PENDING`.
   - Endpoint `/api/reports/[id]/generate` dan worker private Storage untuk menghasilkan binary PDF nyata adalah lingkup Sprint 2.
2. **Kepatuhan Isolasi & Kebijakan Host**:
   - Seluruh pengujian menggunakan stack lokal terisolasi (`127.0.0.1:50243` dan `127.0.0.1:50244`).
   - Tidak ada koneksi atau migrasi yang dijalankan ke database Supabase hosted.

---

## 6. Daftar Berkas yang Diubah / Dihasilkan

- [`.env.local`](file:///d:/TELKOM%20UNIVERSITY/SEMESTER%207/Capstone/Bambu-Satu/.env.local) — Penambahan `DIRECT_URL`.
- `src/app/api/auth/[...nextauth]` — Dihapus (direktori kosong).
- [`docs/PHASE4-SPRINT1-ASSESSMENT-FLOW.md`](file:///d:/TELKOM%20UNIVERSITY/SEMESTER%207/Capstone/Bambu-Satu/docs/PHASE4-SPRINT1-ASSESSMENT-FLOW.md) — Dokumen penerimaan teknis dan bukti fungsional Sprint 1.
- `.tmp/phase4-sprint1/browser-evidence.json` — Bukti respons browser Playwright nyata.
- `.tmp/phase4-sprint1/database-evidence.json` — Bukti query persistensi PostgreSQL.
- `.tmp/phase4-sprint1/results.png` — Tangkapan layar halaman hasil asesmen pada browser nyata.

---

## 7. Rekomendasi Prioritas Berikutnya

**Sprint 2: P0-C — Private Storage PDF Report Generation & Download**
- Menyambungkan hasil asesmen berstatus `PENDING` ke worker pembuatan PDF laporan.
- Menyimpan file PDF terenkripsi/privat ke Supabase Storage lokal.
- Mengubah status report dari `PENDING` ke `GENERATED` setelah artifact berhasil disimpan, sehingga tombol unduh laporan PDF dapat aktif secara jujur.
