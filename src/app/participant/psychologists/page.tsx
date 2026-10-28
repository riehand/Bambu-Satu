import Link from "next/link";
import { requirePageRole } from "@/lib/auth/session";
import { listPsychologists } from "@/lib/psychologist/service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PsychologistsDirectory({ searchParams }: { searchParams: SearchParams }) {
  await requirePageRole("PARTICIPANT");
  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const requestedPage = Number(rawPage ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await listPsychologists({ page, limit: 20 });
  const pageCount = Math.max(1, Math.ceil(result.total / result.limit));

  return <>
    <div className="wb-page-heading"><h1>Kenali psikolog</h1><p>Lihat informasi profesional dari psikolog yang terdaftar di WellBeing Hub.</p></div>
    <div className="wb-notice"><p>Direktori ini menampilkan informasi profesional. Jadwal dan pemesanan konsultasi belum tersedia.</p></div>
    {result.items.length ? <div className="wb-psychologist-grid">{result.items.map((psychologist) => <article className="wb-card wb-psychologist-card" key={psychologist.id}>
      <span className="wb-eyebrow">{psychologist.professionalTitle || "Psikolog"}</span>
      <h2>{psychologist.fullName}</h2>
      {psychologist.qualification && <p className="wb-psychologist-qualification">{psychologist.qualification}</p>}
      {psychologist.shortBio && <p className="wb-psychologist-bio">{psychologist.shortBio}</p>}
      {psychologist.areasOfFocus.length > 0 && <ul className="wb-psychologist-tags" aria-label="Area fokus">{psychologist.areasOfFocus.slice(0, 5).map((focus) => <li key={focus}>{focus}</li>)}</ul>}
      <Link className="wb-button secondary" href={`/participant/psychologists/${psychologist.id}`}>Lihat profil<span aria-hidden="true">→</span></Link>
    </article>)}</div> : <section className="wb-card wb-empty"><h2>Belum ada profil psikolog</h2><p>Informasi psikolog akan tampil di sini setelah akun psikolog tersedia.</p></section>}
    {pageCount > 1 && <nav className="wb-psychologist-pages" aria-label="Halaman direktori">
      {page > 1 && <Link className="wb-button secondary" href={`/participant/psychologists?page=${page - 1}`}>Sebelumnya</Link>}
      <span>Halaman {page} dari {pageCount}</span>
      {page < pageCount && <Link className="wb-button secondary" href={`/participant/psychologists?page=${page + 1}`}>Berikutnya</Link>}
    </nav>}
  </>;
}
