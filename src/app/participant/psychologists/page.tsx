import { Suspense } from "react";
import Link from "next/link";
import { requirePageRole, withApplicationDatabase } from "@/lib/auth/session";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { listPsychologists } from "@/lib/psychologist/service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function PsychologistsDirectoryContent({ searchParams }: { searchParams: SearchParams }) {
  await requirePageRole("PARTICIPANT");
  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const requestedPage = Number(rawPage ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const focus = typeof params.focus === "string" ? params.focus.trim().slice(0, 50) : "";
  const language = typeof params.language === "string" ? params.language.trim().slice(0, 50) : "";
  let result;
  try { result = await withApplicationDatabase(() => listPsychologists({ page, limit: 20, focus: focus || undefined, language: language || undefined })); }
  catch { return <ServiceUnavailable title="Direktori psikolog belum tersedia" message="Profil dan jadwal belum dapat dimuat. Tidak ada pemesanan yang dilakukan. Silakan coba lagi nanti."/>; }
  const pageHref = (value: number) => `/participant/psychologists?${new URLSearchParams({ page: String(value), ...(focus ? { focus } : {}), ...(language ? { language } : {}) })}`;
  const pageCount = Math.max(1, Math.ceil(result.total / result.limit));

  return <>
    <div className="wb-page-heading"><h1>Kenali psikolog</h1><p>Lihat informasi profesional dari psikolog yang terdaftar di WellBeing Hub.</p></div>
    <div className="wb-notice"><p>Pilih profil psikolog untuk melihat jadwal dan persyaratan pemesanan konsultasi.</p></div>
    <form className="wb-directory-filters" action="/participant/psychologists"><label>Area fokus<input name="focus" maxLength={50} defaultValue={focus} placeholder="Contoh: Stres"/></label><label>Bahasa layanan<input name="language" maxLength={50} defaultValue={language} placeholder="Contoh: Indonesia"/></label><button className="wb-button" type="submit">Cari psikolog</button><Link href="/participant/psychologists" className="wb-button secondary">Reset filter</Link></form><p className="wb-muted">{result.total} profil sesuai filter ? Waktu jadwal dalam WIB</p>
    {result.items.length ? <div className="wb-psychologist-grid">{result.items.map((psychologist) => <article className="wb-card wb-psychologist-card" key={psychologist.id}>
      <div className="wb-avatar" aria-hidden="true">{psychologist.fullName.split(" ").slice(0,2).map(word => word[0]).join("")}</div><span className="wb-eyebrow">{psychologist.professionalTitle || "Psikolog"}</span>
      <h2>{psychologist.fullName}</h2>
      {psychologist.qualification && <p className="wb-psychologist-qualification">{psychologist.qualification}</p>}
      {psychologist.shortBio && <p className="wb-psychologist-bio">{psychologist.shortBio}</p>}
      {psychologist.areasOfFocus.length > 0 && <ul className="wb-psychologist-tags" aria-label="Area fokus">{psychologist.areasOfFocus.slice(0, 5).map((focus) => <li key={focus}>{focus}</li>)}</ul>}
      <Link className="wb-button secondary" href={`/participant/psychologists/${psychologist.id}`}>Lihat profil dan jadwal<span aria-hidden="true">→</span></Link>
    </article>)}</div> : <section className="wb-card wb-empty"><h2>Belum ada profil psikolog</h2><p>Informasi psikolog akan tampil di sini setelah akun psikolog tersedia.</p></section>}
    {pageCount > 1 && <nav className="wb-psychologist-pages" aria-label="Halaman direktori">
      {page > 1 && <Link className="wb-button secondary" href={pageHref(page - 1)}>Sebelumnya</Link>}
      <span>Halaman {page} dari {pageCount}</span>
      {page < pageCount && <Link className="wb-button secondary" href={pageHref(page + 1)}>Berikutnya</Link>}
    </nav>}
  </>;
}

export default function PsychologistsDirectory(props: { searchParams: SearchParams }) { return <Suspense fallback={<p role="status">Memuat direktori...</p>}><PsychologistsDirectoryContent {...props}/></Suspense>; }
