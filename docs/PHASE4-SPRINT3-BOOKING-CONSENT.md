# Phase 4 Sprint 3 — Booking dan persetujuan laporan

Status: **PASS untuk alur inti melalui website lokal nyata**, 25 November 2026, branch `riehand_branch`.

Psikolog menyimpan jadwal; participant memilih slot dan memberikan consent eksplisit; booking menghasilkan appointment, sesi konsultasi, dan consent; kedua akun melihat appointment setelah refresh; psikolog mengunduh PDF privat yang sama dengan milik participant. Pencabutan consent menghasilkan penolakan unduhan berikutnya, dan pemberian ulang mengembalikan akses. Participant lain dengan laporan valid mendapat konflik saat memesan slot yang sama. Bukti mencakup browser, respons API, pembacaan PostgreSQL, dan perbandingan bytes Storage.

PASS ini terbatas pada integrasi lokal. Pemilihan beberapa mode konsultasi per appointment belum didukung model existing; yang ditampilkan adalah metode pada profil psikolog. Inbox laporan mandiri tanpa appointment dan aktivasi lifecycle/chat produksi tidak termasuk hasil PASS ini.

## A. Gap awal

- Loader direktori, detail psikolog, dan profil dashboard belum memasang konteks DAL yang diperlukan runtime lokal.
- Query direktori/slot menggunakan ORM dengan RLS milik sendiri sehingga tidak dapat membaca daftar psikolog aktif dan jadwal publik secara tepat.
- Service daftar/detail appointment sengaja menolak jalur gateway dengan 503. UI tidak dapat menampilkan hasil booking yang sebenarnya ada.
- Database lokal yang digunakan website belum memiliki gateway booking/consent Stage 3E.1D. Keberhasilan rehearsal pada database lain tidak membuktikan ketersediaannya di runtime ini.
- AppointmentCenter menganggap respons direktori berbentuk `data.items`; kontrak route sebenarnya `data: [...]` dengan metadata terpisah. Ini menyebabkan crash ketika data nyata dimuat.
- Satu laporan terbaru legacy sudah berstatus GENERATED tetapi tidak memiliki attestation worker. Status tersebut tidak cukup sebagai prasyarat booking dengan PDF nyata.
- Proyeksi timestamp perlu membedakan kolom `timestamptz` appointment dari timestamp asesmen dan menghasilkan ISO UTC dengan `Z`.
- Daftar appointment mengenali consent mandiri, tetapi authorizer download yang diberi scope appointment belum mengizinkan fallback consent mandiri yang valid.

## B. Implementasi existing yang digunakan kembali

Auth GoTrue lokal, session/role check, DAL bertanda tangan, `website_runtime`, RLS, gateway booking/consent Stage 3E.1D, service availability, editor profil/jadwal, route appointment/consent, renderer PDF, worker terpisah, attestation, dan Storage privat Sprint 2 tetap digunakan.

SQL baru di `docs/sql/phase4-sprint3/` adalah adaptasi lokal terarah, bukan migration hosted:

1. `00-booking-consent-base.sql`: memasang bagian booking dan consent dari Stage D yang sebelumnya belum ada. Tidak memasang role/gateway lifecycle atau chat. Lock, pemeriksaan pemilik/asosiasi, audit, dan transaksi atomik dipertahankan.
2. `01-read-projections.sql`: memperluas role display existing dengan grant kolom dan policy terarah; menambahkan proyeksi direktori, slot, dan appointment.
3. `02-booking-artifact.sql`: memeriksa keberadaan attestation pada booking context dan di dalam gateway atomik existing.
4. `03-report-scope.sql`: mempertahankan independensi consent mandiri, dengan validasi assignment terhadap scope appointment yang diberikan.

Skrip ini membutuhkan database/marker/setting approval lokal. Penerapan dilakukan setelah pemeriksaan environment; berkas bootstrap bukan skrip idempotent untuk dijalankan ulang sembarangan. Draft Stage D/F, SQL Sprint 2, schema Prisma, dan delapan migration historis tidak diubah.

## C. Direktori dan availability

Page server memasang `withApplicationDatabase` dan batas Suspense sesuai dokumentasi Next.js lokal. Direktori/detail/slot memakai proyeksi yang hanya mengembalikan informasi profesional yang diperbolehkan. Psikolog nonaktif tidak muncul dan detail/slot-nya ditolak.

`wb_display_projection` tetap NOLOGIN dan NOBYPASSRLS. Tidak ada grant SELECT menyeluruh pada `public.users`; email dan telepon tidak dapat dibaca role ini. `website_runtime` tidak memperoleh akses tabel lintas pengguna sebagai fallback.

Editor psikolog existing menyimpan jadwal melalui route/service existing. Slot tersimpan setelah reload dan slot yang sama tampil pada participant. Waktu 02:00–04:00 UTC ditampilkan 09.00–11.00 Asia/Jakarta. Slot yang sudah BOOKED tidak dapat diedit dan hilang dari daftar slot publik.

UI participant mengosongkan slot dan consent saat tanggal berubah, mengabaikan respons tanggal lama melalui cleanup existing, menyediakan retry jadwal/persyaratan, serta memblokir booking saat load belum berhasil. Ref in-flight mencegah pengiriman booking ganda.

## D. Booking nyata

Booking tetap melalui `wb_guard.book_appointment`, bukan INSERT Prisma langsung. Gateway memeriksa participant, psikolog aktif, asesmen COMPLETED terbaru, asosiasi report/session, GENERATED, attestation, slot milik psikolog dan AVAILABLE, serta consent eksplisit. Appointment, sesi konsultasi, slot BOOKED, grant, dan audit dibuat atomik.

Laporan legacy tanpa attestation dipertahankan. Untuk memenuhi aturan asesmen terbaru, kedua participant menyelesaikan asesmen baru melalui UI dan menekan Buat PDF melalui aplikasi nyata; tidak ada seed GENERATED atau appointment. Worker Sprint 2 membuat dan memverifikasi artifact privat. Laporan participant kedua valid sehingga respons konflik 409 benar-benar membuktikan slot sudah dipesan, bukan sekadar penolakan karena laporan tidak valid.

Metode existing berupa teks pada profil psikolog, diuji dengan `Tatap muka — ruang uji lokal`, dan terlihat pada profil/detail appointment. Tidak ada kolom mode per appointment atau selector mode pada kontrak booking existing. Sprint ini tidak membuat pilihan mode semu atau mengubah schema. Bila institusi memerlukan pilihan beberapa mode dan snapshot metode saat booking, itu gap lanjutan yang memerlukan keputusan produk.

## E. Appointment untuk kedua peran

Service list/detail menggunakan proyeksi DTO dengan assignment RLS. Participant melihat janji miliknya; psikolog melihat janji yang ditugaskan. Endpoint detail existing dihubungkan ke tombol Lihat detail janji pada kedua UI. Nama pihak terkait, jadwal, status appointment/sesi, catatan yang relevan, dan metode profil dapat ditampilkan tanpa membocorkan kontak atau skor klinis pada listing.

AppointmentCenter membaca kontrak array direktori yang benar. Kegagalan pilihan direktori/booking context tidak menghilangkan daftar janji atau menghalangi pencabutan consent existing. Kegagalan load inti menampilkan error dan retry, bukan daftar kosong palsu. Informasi detail dimuat dari endpoint terotorisasi, bukan dibentuk dari fixture.

## F. Consent, revoke, dan reconsent

Checkbox eksplisit diperlukan saat booking. Grant appointment tampil aktif; pencabutan melalui UI langsung menyegarkan status, dan reconsent membuat grant/audit baru tanpa menghapus riwayat lama. Masa berlaku tetap mengikuti aturan existing dan akhir jadwal appointment.

UI consent mandiri juga berhasil memberikan dan mencabut izin. Tes nyata mencabut consent appointment, memberikan izin mandiri, membuktikan download diizinkan, mencabut izin mandiri, lalu membuktikan download ditolak. Consent appointment kemudian diberikan kembali melalui UI. Grant mandiri tidak mengubah appointment.

Permintaan download dengan scope appointment yang tidak dikenal tetap ditolak walaupun ada consent mandiri. Consent untuk appointment lama lain tidak dapat dipakai sebagai izin appointment yang consent-nya sudah dicabut.

## G. Otorisasi PDF psikolog

Unduhan menggunakan route aplikasi privat existing, ticket singkat, worker, validasi digest/ukuran, dan pemeriksaan ulang izin sesudah I/O Storage. Browser tidak menerima credential database/Storage atau URL publik permanen. Report hanya tersedia jika consent dan artifact memenuhi pemeriksaan existing.

File unduhan browser psikolog berukuran **17.813 bytes**, identik byte-for-byte dengan unduhan pemilik dan object Storage privat. SHA-256:

`d63488e31fd21e8c24ffb123424b0296ba2921ea10cc7c09c5e7d69bff2cba44`

Bucket `assessment-reports` memiliki `public=false`. Permintaan anonymous ke endpoint object publik menghasilkan HTTP 400 dan tidak mengembalikan PDF.

## H. Acceptance browser nyata

Pengujian memakai Next.js `127.0.0.1:55430`, GoTrue lokal, PostgreSQL, worker `127.0.0.1:55440`, dan Storage nyata. Dua participant, dua psikolog aktif, dan satu psikolog nonaktif merupakan akun sintetis Auth yang sah. Tidak ada mock login atau intersepsi API yang mengembalikan fixture pada acceptance ini; traffic browser nonlokal diblokir.

| Langkah | Hasil aktual |
| --- | --- |
| Login psikolog dan participant | HTTP 200, dashboard sesuai peran |
| Simpan availability dan reload | PUT 200; slot Pagi tetap tercentang |
| Direktori/detail/jadwal participant | Psikolog aktif dan slot 09:00 tampil |
| Sebelum consent | Tombol Pesan sesi disabled |
| Booking tanpa consent / report invalid | HTTP 403 / 403 |
| Booking melalui klik UI | POST 201, CONFIRMED, ID appointment/sesi/consent nyata |
| Refresh participant dan psikolog | Appointment yang sama tampil; detail SCHEDULED |
| Unduh PDF psikolog | File nyata tersimpan; sama dengan PDF pemilik |
| Revoke appointment | Status tidak aktif; download berikutnya 404; link hilang setelah refresh |
| Reconsent appointment | Status aktif; download 200, bytes tetap sama |
| Participant lain / psikolog tanpa assignment | Detail dan download 404 |
| Participant kedua dengan report miliknya yang valid | Booking slot yang sama 409 `SLOT_ALREADY_BOOKED` |
| Submit ulang booking pemilik | 409; tidak membuat duplikat |
| Refresh slot / editor psikolog | Slot publik hilang; BOOKED disabled |
| Psikolog nonaktif | Tidak muncul di direktori; detail/slot 404; booking 403; login 403 |
| Consent mandiri | Grant → download 200; revoke → 404; scope appointment salah tetap 404 |
| Akses Storage publik | 400 tanpa PDF |

Tes utama `booking-consent.spec.ts` lulus; tes akses `booking-access.spec.ts` juga lulus dan dijalankan ulang setelah perbaikan loading AppointmentCenter terakhir. Screenshot utama memperlihatkan detail dan metode profil pada kedua sisi. Snapshot tersebut diambil sebelum penambahan tombol refresh AppointmentCenter terakhir; verifikasi consent setelah perubahan itu menggunakan browser nyata ulang.

Bukti lokal yang diabaikan Git: `.tmp/phase4-sprint3/browser-evidence.json`, `access-evidence.json`, `browser.log`, `access-browser.log`, `participant-appointments.png`, `psychologist-appointments.png`, dan `psychologist-download.pdf`. Fixture credential terpisah tidak dimasukkan ke laporan/Git.

## I. Persistence PostgreSQL dan isolasi

Pembacaan final dilakukan dalam transaksi READ ONLY setelah tes consent terakhir, disimpan pada `.tmp/phase4-sprint3/persistence-evidence.json`.

| Record | Nilai yang diverifikasi |
| --- | --- |
| Appointment | `225d72f7-32d3-42e9-87e9-faef89322697`, CONFIRMED |
| Availability | `7fdf3e80-eed2-4a40-94a9-0f4c14acec67`, BOOKED; tepat satu appointment pada slot |
| Consultation session | `62589a50-9740-44a4-bf2f-02a8b9cbe190`, SCHEDULED |
| Jadwal | 2 Desember 2026, 09.00–11.00 WIB; tersimpan 02:00–04:00 UTC |
| Assessment | `6b8c34e1-3d2f-4c2a-89af-8e3b0798e6f9`, COMPLETED, 35 jawaban |
| Skor resmi | Depression 14, Anxiety 14, Stress 14, WEMWBS 42 |
| Report | `4f4e6e9a-f202-4910-8c01-bddd946123cc`, GENERATED, terkait asesmen/pemilik yang benar |
| Artifact | Canonical key `reports/4f4e6e9a-f202-4910-8c01-bddd946123cc.pdf`, digest/ukuran cocok dengan Storage/browser |
| Consent awal | `e852c5ee-e219-4fa0-9d7e-2af475aaa569`, revoked; riwayat tetap ada |
| Consent akhir | Tepat satu grant appointment aktif, expiry 2 Desember 2026 11.00 WIB; grant mandiri pengujian sudah revoked |
| Audit | GRANTED, ACCESSED, REVOKED tersimpan pada grant yang terkait |

Tidak ditemukan perbedaan antara status UI akhir dan database. Beberapa appointment dari percobaan awal tetap tersimpan sebagai data sintetis; tidak ada reset atau penghapusan agar tes terlihat bersih. Date counter memilih tanggal baru pada percobaan booking berikutnya.

Container existing dipertahankan: `wb-sprint1-db`, `wb-sprint1-auth-real`, `wb-sprint1-kong`, `wb-sprint1-storage`, dengan label `wellbeing.sprint=phase4-sprint1` dan network `wb-sprint1-loopback`. Port host hanya `127.0.0.1:50244` untuk PostgreSQL dan `127.0.0.1:50243` untuk Auth/Storage gateway; Auth/Storage tidak mempunyai binding host sendiri. Context Docker lokal, binding aktual, network, marker database, dan bucket diperiksa sebelum operasi. Tidak ada restart/reset yang diperlukan pada Sprint 3.

Website tetap memakai `website_runtime`; worker memakai role terpisah. Inspeksi/provisioning lokal menggunakan identitas admin lokal di luar runtime website, bukan fallback aplikasi. Role runtime/display/booking/consent bukan superuser, tidak BYPASSRLS, dan tidak CREATEROLE. Role fungsi NOLOGIN. Katalog membuktikan runtime tidak mempunyai INSERT langsung appointment, EXECUTE finalizer worker, atau membership role booking. Fungsi `transition_consultation`, `send_message`, dan `read_messages` tidak dipasang pada database website ini.

## J. Pengujian terarah dan milestone

| Pemeriksaan | Hasil aktual |
| --- | --- |
| Appointment, report authorization, psychologist/profile/availability API/service | PASS — 70 tes, 7 suite |
| Browser website nyata | PASS — 2 skenario integrasi; skenario akses diulang sesudah perubahan UI terakhir |
| `npm.cmd test` | PASS — 579 tes, 37 file |
| `npm.cmd run test:browser -- --reporter=list` | PASS — 129 tes harness existing termasuk 3 regresi baru |
| `npm.cmd exec -- tsc --noEmit` | PASS |
| ESLint berkas terubah | PASS |
| `npm.cmd run lint` | PASS — 0 error; 2 warning `<img>` existing di `src/app/page.tsx` |
| `npm.cmd run build` | PASS — konfigurasi environment sintetis loopback |
| Persistence, bytes Storage, privilege katalog | PASS — pembacaan final read-only |
| Checksum migration historis | PASS — seluruh 8 checksum filesystem sama dengan `_prisma_migrations` |
| `git diff --check` | PASS; peringatan konversi LF/CRLF existing tetap ada |

Regresi browser baru memeriksa kegagalan load tanggal lalu retry tanpa booking slot lama, detail appointment gagal lalu retry berhasil, dan kegagalan direktori yang tidak memblokir pencabutan consent. Dua fixture direktori diperbaiki mengikuti kontrak API sebenarnya; assertion existing tidak dikurangi. Tes nyata tambahan mencakup seluruh perjalanan booking dan consent serta penolakan akses dasar.

Regresi penuh dijalankan sekali setelah perjalanan inti berhasil. Pengujian milestone memakai override environment lokal sintetis; pembacaan nama `.env` oleh Next build tidak berarti credential hosted digunakan. Rehearsal PostgreSQL 137 tes tidak dijalankan ulang.

Percobaan awal menemukan missing gateway, mismatch DTO, dan format timestamp; akar masalahnya diperbaiki. Skrip browser juga diperbaiki untuk menunggu hydration serta mengirim hanya field payload yang sah. Kegagalan awal tidak dihitung sebagai acceptance. Automatic approval review sempat tidak tersedia karena batas penggunaan; perintah saat itu tidak dieksekusi. Pada kelanjutan ini approval berhasil dan seluruh pemeriksaan tertunda selesai tanpa bypass.

Log akhir: `.tmp/phase4-sprint3/{targeted-results,milestone-results,persistence-evidence}.json`, `targeted.log`, `full-test.log`, `full-browser.log`, `full-tsc.log`, `full-lint.log`, dan `full-build.log`.

## K. Batasan dan blocker tersisa

- Integrasi ini lokal saja. Persetujuan KKA/produksi dan custody signer/worker produksi belum dinyatakan selesai; proses lokal masih berada pada mesin pengembangan yang sama.
- Human Chat dan transisi lifecycle produksi tidak diaktifkan. UI lifecycle lama dapat tetap menampilkan status/link, tetapi gateway mutasinya tidak dipasang. Aturan institusi tetap menunggu persetujuan.
- Mode konsultasi ditampilkan dari profil saat ini, bukan pilihan/snapshot per appointment. Tidak ada klaim bahwa pemilihan multi-mode selesai.
- Consent mandiri melalui participant dan akses untuk psikolog yang memiliki appointment berhasil. Inbox mandiri bagi psikolog tanpa appointment masih merupakan gap terpisah.
- Expiry waktu masa depan tidak disimulasikan dengan mengubah jam/data database. Aturan expiry dipertahankan dan tercakup tes service existing; browser nyata membuktikan revoke/regrant dan nilai expiry tersimpan.
- Booking memeriksa attestation database; keberadaan bytes Storage dibuktikan saat acceptance dan kembali diverifikasi saat download. Penghapusan object di masa depan tidak dapat dicegah hanya oleh metadata attestation.
- Laporan legacy tanpa attestation tetap tidak layak booking. Tidak dilakukan pemalsuan artifact atau perubahan status legacy agar acceptance lulus.

## L. Berkas berubah dan status Git

Inventaris dibandingkan dengan hash snapshot sebelum Sprint 3, bukan seluruh diff terhadap HEAD yang sudah berisi pekerjaan Phase 3/Sprint 1–2.

**10 berkas existing diubah dalam Sprint 3:**

- `src/app/participant/psychologists/page.tsx`
- `src/app/participant/psychologists/[psychologistId]/page.tsx`
- `src/app/psychologist/dashboard/page.tsx`
- `src/components/participant/appointment-center.tsx`
- `src/components/participant/psychologist-availability.tsx`
- `src/components/psychologist/appointment-list.tsx`
- `src/lib/appointments/runtime.ts`
- `src/lib/appointments/service.ts`
- `src/lib/psychologist/service.ts`
- `tests/browser/phase3.spec.ts`

**9 berkas baru Sprint 3:**

- `src/components/appointments/details.tsx`
- `src/lib/psychologist/runtime.ts`
- `tests/local-website/booking-consent.spec.ts`
- `tests/local-website/booking-access.spec.ts`
- `docs/sql/phase4-sprint3/00-booking-consent-base.sql`
- `docs/sql/phase4-sprint3/01-read-projections.sql`
- `docs/sql/phase4-sprint3/02-booking-artifact.sql`
- `docs/sql/phase4-sprint3/03-report-scope.sql`
- `docs/PHASE4-SPRINT3-BOOKING-CONSENT.md`

Worktree tetap dirty pada `riehand_branch`. `src/lib/appointments/runtime.ts` sudah ada tetapi belum tracked sebelum Sprint 3. Diff tracked keseluruhan saat pemeriksaan adalah 34 berkas, 403 penambahan dan 80 penghapusan; angka ini mencakup pekerjaan sebelumnya serta tidak memasukkan berkas untracked. Tidak ada berkas snapshot awal yang dihapus; seluruh schema/migration, draft historis, dan perubahan sebelumnya di luar daftar di atas tetap utuh. Berkas untracked lain yang sudah ada tidak dibersihkan.

Tidak ada akses hosted Supabase, perubahan secret environment, commit, push, merge, atau deployment. Sprint 3 berhenti pada implementasi lokal, validasi, dan laporan ini.
