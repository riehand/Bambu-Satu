# Release candidate — 26 November 2026

> Catatan ini merekam commit RC ced3f1d. Adaptasi staging selanjutnya tersedia di [STAGING-FIRST-TIME.md](STAGING-FIRST-TIME.md); status lama ?adapter belum ada? di bawah adalah baseline RC, bukan status kode terbaru.

Target Git: `riehand_branch`. Vercel belum terhubung pada sesi ini; belum ada URL deployment. Tidak ada proyek Supabase dibuat atau SQL hosted dijalankan.

## Preview Vercel

1. Pemilik memilih Vercel team/project dan memberikan akses melalui integrasi GitHub ke `riehand/Bambu-Satu` atau menghubungkan Vercel CLI secara privat. Jangan mengirim token melalui chat.
2. Import repository, root `.`, preset Next.js. Production Branch tetap `main`; `riehand_branch` hanya Preview. `vercel.json` sengaja mematikan deployment Git otomatis. Import pertama/deployment manual tetap merupakan tindakan deployment dan harus menunggu instruksi.
3. Pilih Node.js 22.x di project settings. Build `npm run build:vercel` menghasilkan Prisma Client 5.22 dan build Next.js; tidak ada migration, seed, atau provisioning. Output directory mengikuti Next.js. Jangan menjadikan aplikasi static export.
4. Tentukan satu domain/alias preview stabil. Set `SITE_URL` ke origin HTTPS persis domain tersebut pada Preview environment, khusus branch ini. Auth Site URL dan allowlist `/auth/confirm` harus memakai domain staging/preview yang sama. Login memakai exact-origin CSRF; membuka domain deployment acak tidak otomatis diizinkan. Jangan mengambil trusted origin dari header Host.
5. Set public Supabase variables sebelum build. Rebuild setelah nilai public berubah. Aktifkan Deployment Protection bila tersedia. Jangan isi environment Production dengan credential staging. Jangan menyalin `.env.local` developer atau credential Supabase bersama.
6. Setelah persetujuan deployment: deploy Preview dari commit yang sudah ditinjau, buka domain stabil, dan lakukan acceptance menggunakan akun staging yang disetujui. Belum ada klaim build di Vercel atau acceptance hosted.

Konfigurasi: [Vercel JSON](https://vercel.com/docs/project-configuration/vercel-json), [Preview environments](https://vercel.com/docs/deployments/environments), [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls). `.vercelignore` mencegah artifact lokal/secret/docs operasional ikut CLI upload; Git import menggunakan snapshot Git, sehingga kebersihan commit tetap wajib.

## Environment (nama saja)

| Penempatan | Variable | Kebutuhan |
| --- | --- | --- |
| Vercel Preview, build dan runtime | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Proyek staging yang disetujui, public configuration |
| Vercel Preview, server | `SITE_URL` | Origin HTTPS preview stabil yang terdaftar pada Auth |
| Adapter klinis mendatang, server | `DATABASE_URL` | Credential role `website_runtime` restricted staging; tidak cukup untuk mengaktifkan adapter |
| Jalur migration operator terpisah | `DIRECT_URL` | Tidak dipasang sebagai owner fallback di website; tidak diperlukan untuk akses Auth/profile |
| Worker terpisah | `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | Storage credential hanya di worker; custody dan privilege harus ditinjau |
| Integrasi worker mendatang | `WELLBEING_PDF_WORKER_URL`, `WELLBEING_PDF_WORKER_TOKEN` | Nama existing, tetapi client saat ini local-only. Endpoint HTTPS dan adapter hosted belum diimplementasikan; jangan isi URL localhost pada Vercel |

Credential database worker dan identitas signing saat ini disuplai launcher lokal dari fixture file. Nama/configuration hosted baru ditetapkan bersama desain signer/worker yang disetujui; jangan mempromosikan file fixture atau kunci lokal. `WELLBEING_LOCAL_RUNTIME_FILE`, rehearsal markers/tokens, dan test signer **tidak boleh diset pada Vercel**. Tidak ada variable `enable=true` yang dapat membuat adapter hosted siap.

## Gating dan fitur preview

Gate existing tetap fail-closed: tanpa runtime restricted terpasang, Prisma aplikasi melempar `RESTRICTED_RUNTIME_REQUIRED`; initializer prototype menolak production. Worker client menolak production/nonlocal. Clinical UI menampilkan unavailable/PENDING, tidak mengarang skor atau link PDF. Lifecycle/chat produksi tetap ditolak kebijakan existing. Gate ini tidak diubah menjadi bypass untuk preview.

Dapat ditampilkan: landing, login/registration UI, bantuan, privasi, dan layout responsif. Login/profil dan navigasi peran membutuhkan Auth staging nyata + `public.users` beserta own-profile RLS dan akun terkonfirmasi. Signup masih blocked pada preflight institutional ID restricted. Asesmen, PDF, booking, consent, jadwal, dan monitoring hosted blocked sampai adapter/gateway tersedia; frontend dan business service tetap canonical.

## Jalur staging terisolasi

Target yang diminta persetujuan: proyek Supabase staging **terpisah**, region dan owner/team ditentukan pengguna, tanpa copy data/Auth users dari proyek bersama. Tidak membuat proyek sebelum target disetujui.

### Artifact dapat dipakai setelah target disetujui

- Schema migration historis tetap utuh. Pada staging kosong, apply baseline `20261021144827_init_users` dan `20261023000000_supabase_auth` terlebih dahulu terhadap Auth schema Supabase yang nyata. Jangan menyalin ledger dari shared database. Trigger/RLS baseline harus diperiksa terhadap target kosong, tanpa pengguna legacy.
- Enam migration berikut kemudian berlaku berurutan: `20261023010000_phase2_assessment`, `20261028000000_psychologist_profiles`, `20261029000000_psychologist_availability`, `20261029000001_appointments_report_consent`, `20261120000000_psychologist_profiles_integrity`, `20261121000000_consultation_messages`. Semua file sudah tersedia di `prisma/migrations/`. Schema chat tidak berarti mengaktifkan chat. Jangan apply subset sambil mengklaim semua pending migration sudah selesai.
- UI/API/service scoring, booking, consent dan renderer PDF Sprint 1–3 digunakan ulang. Tidak ada duplikasi frontend atau salinan database klinis nyata.
- Provision bucket `assessment-reports` private hanya setelah target dan policy disetujui. Jangan memakai public URL atau menjadikan service-role key sebagai credential website.

### Memerlukan desain/adaptasi dan persetujuan sebelum eksekusi

| Dependency | Sumber existing | Pekerjaan sebelum siap hosted |
| --- | --- | --- |
| Restricted roles, RLS, mutation guards | `docs/sql/stage3e1b/01..04` | Review ownership/grants dan identity verifier, tanpa BYPASSRLS/owner fallback |
| Scoring, results/history/report authorization | `docs/sql/stage3e1c/01..03` | Adaptasi authority/projection ke request identity hosted yang disetujui |
| Booking/consent/directory/report scope | `docs/sql/phase4-sprint3/00..03` | Review dependency stage3e1d dan staging artifact requirements; tidak mengaktifkan lifecycle/chat |
| PDF job, ticket, attestation, finalizer | `docs/sql/phase4-sprint2/00..02`, `src/lib/reports/worker.ts` | Pisahkan website/worker role; ganti issuer/kid/custody lokal dengan identitas worker hosted yang disetujui |
| Request signer dan DAL | `src/lib/dal/context.ts`, `src/lib/dal/local-bootstrap.ts` | Adapter hosted belum ada. Tidak menghapus validasi loopback lalu menyebutnya production-ready |
| Worker transport/deployment | `src/lib/reports/runtime.ts`, `local-worker-server.ts` | HTTPS authenticated endpoint, separate service/runtime, credentials, timeouts/retry dan finalizer matching |
| Registration | `src/app/api/auth/register/route.ts` | Preflight NIM/NIP dengan privilege terbatas; pertahankan uniqueness dan Auth triggers |
| Instrument/periode/akun uji | Baseline Phase 2 | Konten berlisensi/disetujui dan periode aktif serta akun staging sintetis; tanpa menyalin data shared |

SQL rehearsal di atas adalah sumber desain, **bukan paket SQL hosted siap dieksekusi**. Menyetujui proyek staging tidak otomatis menyetujui local HMAC keys, audience, atau akses owner pada aplikasi. Setelah adapter dan gateway siap, lakukan satu milestone acceptance inti (Auth → assessment → hasil/PDF → booking → consent revoke dan denial lintas akun), bukan rehearsal tambahan per perubahan kecil.

## Persetujuan yang diperlukan

1. Push commit RC ke `origin/riehand_branch` (tanpa merge/force-push).
2. Vercel team/project, domain stabil dan instruksi menjalankan deployment Preview.
3. Target Supabase staging baru/terpisah, region, pemilik, biaya dan scope baseline + enam migration.
4. Desain identitas hosted, role/grant, private Storage, signer dan worker credentials/transport.
5. KKA: aktivasi lifecycle/chat, pengelolaan peran, perubahan periode produksi, ekspor/audit, dan AI. Ini tetap di luar aktivasi preview awal.

Supabase bersama tidak menjadi target langkah-langkah ini. Perubahan terhadap shared database memerlukan persetujuan terpisah dari pemilik database/Flutter. Tidak ada reset data/volume, perubahan migration historis, merge, push, deployment, atau provisioning otomatis.

## Validasi release candidate

- `npm run build:vercel`: PASS (Prisma Client 5.22 generation, Next.js production compilation, TypeScript, prerender dan route output). Build memakai override proses berupa placeholder loopback; tidak mengubah file env dan tidak membuktikan koneksi hosted. Wrapper pencetak log mengalami encoding error setelah build exit 0; hasil build sendiri berhasil.
- `git diff --check`: PASS. Tidak mengulang browser regression yang sudah diterima pengguna.
- Scan pola credential snapshot kerja tidak menemukan private key/JWT/service secret/token GitHub; URL database yang terdeteksi merupakan placeholder atau fixture sintetis. Ini bukan audit seluruh riwayat Git.
- Catatan owner-only yang sudah di-ignore dikeluarkan dari index saja, salinan lokal dipertahankan. Riwayat Git lama tidak ditulis ulang; catatan tersebut masih dapat berada pada commit lama. Tes existing dipertahankan.
- Tidak ditemukan `.vercel/project.json` dan tidak tersedia koneksi Vercel pada sesi ini. Belum ada deployment atau acceptance hosted.
