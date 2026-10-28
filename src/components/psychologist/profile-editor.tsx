"use client";

import { useState, type FormEvent } from "react";

type Profile = {
  professionalTitle: string | null;
  qualification: string | null;
  education: string | null;
  shortBio: string | null;
  areasOfFocus: string[];
  consultationMethod: string | null;
  consultationLocation: string | null;
  languages: string[];
};

const fields: { key: "professionalTitle" | "qualification" | "education" | "shortBio" | "consultationMethod" | "consultationLocation"; label: string; hint: string; multiline?: boolean }[] = [
  { key: "professionalTitle", label: "Gelar atau sebutan profesional", hint: "Contoh: Psikolog", },
  { key: "qualification", label: "Kualifikasi", hint: "Contoh: Psikolog Klinis", },
  { key: "education", label: "Pendidikan", hint: "Pendidikan atau pelatihan profesional", multiline: true },
  { key: "shortBio", label: "Tentang saya", hint: "Perkenalkan pendekatan dan pengalaman Anda", multiline: true },
  { key: "consultationMethod", label: "Metode konsultasi", hint: "Informasi umum, misalnya tatap muka atau daring", },
  { key: "consultationLocation", label: "Lokasi konsultasi", hint: "Lokasi umum praktik; jangan cantumkan data pribadi", },
];

export function PsychologistProfileEditor({ initialProfile }: { initialProfile: Profile | null }) {
  const [profile, setProfile] = useState<Profile>({
    professionalTitle: initialProfile?.professionalTitle ?? "",
    qualification: initialProfile?.qualification ?? "",
    education: initialProfile?.education ?? "",
    shortBio: initialProfile?.shortBio ?? "",
    areasOfFocus: initialProfile?.areasOfFocus ?? [],
    consultationMethod: initialProfile?.consultationMethod ?? "",
    consultationLocation: initialProfile?.consultationLocation ?? "",
    languages: initialProfile?.languages ?? [],
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  function setText(key: Exclude<keyof Profile, "areasOfFocus" | "languages">, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/psychologist/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          areasOfFocus: profile.areasOfFocus.map((item) => item.trim()).filter(Boolean),
          languages: profile.languages.map((item) => item.trim()).filter(Boolean),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("save-failed");
      setMessage("Profil berhasil disimpan.");
    } catch {
      setFailed(true);
      setMessage("Profil belum berhasil disimpan. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return <form className="ph-card ph-form" onSubmit={save}>
    <div className="ph-section-heading"><div><h2>Informasi profesional</h2><p>Informasi ini akan terlihat oleh peserta pada direktori psikolog.</p></div></div>
    {fields.map(({ key, label, hint, multiline }) => <label className="ph-field" key={key}>
      <span>{label}</span>
      {multiline
        ? <textarea rows={key === "shortBio" ? 5 : 3} maxLength={key === "shortBio" ? 800 : 800} value={String(profile[key] ?? "")} onChange={(event) => setText(key, event.target.value)} placeholder={hint}/>
        : <input maxLength={key === "qualification" ? 160 : key === "consultationLocation" ? 180 : 120} value={String(profile[key] ?? "")} onChange={(event) => setText(key, event.target.value)} placeholder={hint}/>}
    </label>)}
    <label className="ph-field"><span>Area fokus</span><textarea rows={3} maxLength={1200} value={profile.areasOfFocus.join("\n")} onChange={(event) => setProfile((current) => ({ ...current, areasOfFocus: event.target.value.split("\n").slice(0, 20) }))}/><small>Tulis satu area per baris, maksimal 20 area.</small></label>
    <label className="ph-field"><span>Bahasa layanan</span><textarea rows={2} maxLength={1200} value={profile.languages.join("\n")} onChange={(event) => setProfile((current) => ({ ...current, languages: event.target.value.split("\n").slice(0, 20) }))}/><small>Tulis satu bahasa per baris, maksimal 20 bahasa.</small></label>
    <div className="ph-form-footer"><p className={failed ? "ph-status ph-error" : "ph-status"} role="status" aria-live="polite">{message}</p><button className="ph-button" type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan profil"}</button></div>
  </form>;
}
