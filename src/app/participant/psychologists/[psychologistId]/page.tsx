import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/auth/session";
import { getPsychologistById } from "@/lib/psychologist/service";
import { psychologistIdSchema } from "@/lib/validations/psychologist";

export default async function PsychologistDetail({ params }: { params: Promise<{ psychologistId: string }> }) {
  await requirePageRole("PARTICIPANT");
  const { psychologistId } = await params;
  const parsedId = psychologistIdSchema.safeParse(psychologistId);
  if (!parsedId.success) notFound();
  const psychologist = await getPsychologistById(parsedId.data);
  if (!psychologist) notFound();

  return <>
    <Link className="wb-back-link" href="/participant/psychologists">← Kembali ke direktori</Link>
    <div className="wb-page-heading"><span className="wb-eyebrow">{psychologist.professionalTitle || "Psikolog"}</span><h1>{psychologist.fullName}</h1><p>{psychologist.qualification || "Informasi profesional"}</p></div>
    <section className="wb-card wb-psychologist-detail"><h2>Tentang psikolog</h2><p>{psychologist.shortBio || "Profil ini belum memiliki ringkasan."}</p>
      {psychologist.education && <div><h3>Pendidikan</h3><p>{psychologist.education}</p></div>}
      {psychologist.areasOfFocus.length > 0 && <div><h3>Area fokus</h3><ul className="wb-psychologist-tags">{psychologist.areasOfFocus.map((focus) => <li key={focus}>{focus}</li>)}</ul></div>}
      {psychologist.languages.length > 0 && <div><h3>Bahasa layanan</h3><ul className="wb-psychologist-tags">{psychologist.languages.map((language) => <li key={language}>{language}</li>)}</ul></div>}
      {(psychologist.consultationMethod || psychologist.consultationLocation) && <div><h3>Informasi konsultasi</h3>{psychologist.consultationMethod && <p>{psychologist.consultationMethod}</p>}{psychologist.consultationLocation && <p>{psychologist.consultationLocation}</p>}</div>}
    </section>
    <div className="wb-notice"><p>Informasi ini belum menyediakan jadwal atau pemesanan konsultasi. Profil ini tidak memberi akses kepada psikolog atas hasil asesmen Anda.</p></div>
  </>;
}
