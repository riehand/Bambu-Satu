"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AppointmentPage, Overview, PeriodDetail, PeriodPage, PsychologistPage } from "@/lib/admin/service";
import "./console.css";
type Tab = "overview" | "periods" | "psychologists" | "appointments" | "users" | "audit" | "monitor";
const tabs: { key: Tab; label: string }[] = [{ key: "overview", label: "Ringkasan" }, { key: "monitor", label: "Statistik layanan" }, { key: "periods", label: "Periode akademik" }, { key: "psychologists", label: "Pemantauan psikolog" }, { key: "appointments", label: "Pengawasan janji" }, { key: "users", label: "Pengguna & peran" }, { key: "audit", label: "Consent & audit" }];
const labels: Record<string, string> = { ACTIVE: "Aktif", INACTIVE: "Nonaktif", CONFIRMED: "Dikonfirmasi", IN_PROGRESS: "Berlangsung", COMPLETED: "Selesai", CANCELLED: "Dibatalkan", RESCHEDULED: "Dijadwalkan ulang", NO_SHOW: "Tidak hadir", SCHEDULED: "Terjadwal", READY: "Siap", CLOSED: "Ditutup", PARTICIPANT_LATE: "Peserta terlambat", PSYCHOLOGIST_LATE: "Psikolog terlambat", AVAILABLE: "Tersedia", BOOKED: "Dipesan", UNAVAILABLE: "Tidak tersedia" };
const dateTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
const date = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(`${value}T00:00:00+07:00`));
function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const current = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); current.current = controller;
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Data belum dapat dimuat.");
      if (!controller.signal.aborted) setData(result.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Data belum dapat dimuat."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, revision]);
  return { data, error, loading, retry: () => { current.current?.abort(); setData(null); setError(""); setLoading(true); setRevision(value => value + 1); } };
}
function Feedback({ loading, error, retry }: { loading: boolean; error: string; retry: () => void }) {
  return <>{loading && <p role="status">Memuat data operasional...</p>}{error && <p role="alert">{error}</p>}<button type="button" disabled={loading} onClick={retry}>Muat ulang data</button></>;
}
function Pagination({ next, onNext, onFirst }: { next: string | null; onNext: (cursor: string) => void; onFirst: () => void }) {
  return <div className="admin-pagination"><button type="button" onClick={onFirst}>Halaman awal</button><button type="button" disabled={!next} onClick={() => next && onNext(next)}>Halaman berikutnya</button></div>;
}
function CountTable({ title, rows }: { title: string; rows: { status: string; count: number }[] }) {
  return <table><caption>{title}</caption><thead><tr><th scope="col">Status</th><th scope="col">Jumlah</th></tr></thead><tbody>{rows.map(row => <tr key={row.status}><th scope="row">{labels[row.status] ?? row.status}</th><td>{row.count}</td></tr>)}</tbody></table>;
}
function OverviewView({ url }: { url: string }) {
  const result = useResource<Overview>(url);
  return <section aria-busy={result.loading}><h2>Ringkasan operasional</h2><Feedback {...result}/>{result.data && <>
    <p>Akun aktif dihitung global saat ini. Asesmen dimulai berdasarkan waktu mulai; selesai berdasarkan waktu selesai. Janji dan konsultasi berdasarkan jadwal mulai pada rentang WIB.</p>
    <dl className="admin-kpis">{[["Peserta aktif terdaftar", result.data.activeParticipants], ["Psikolog aktif", result.data.activePsychologists], ["Asesmen dimulai", result.data.assessmentsStarted], ["Asesmen selesai", result.data.assessmentsCompleted]].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
    <p>Periode berstatus aktif: <strong>{result.data.activePeriod?.name ?? "Belum ada periode aktif"}</strong>{result.data.activePeriod && ` (${date(result.data.activePeriod.startDate)} – ${date(result.data.activePeriod.endDate)})`}</p>
    <div className="admin-summaries"><CountTable title="Janji berdasarkan status" rows={result.data.appointments}/><CountTable title="Status konsultasi tersimpan" rows={result.data.consultations}/><CountTable title="Ketersediaan psikolog aktif" rows={result.data.availability}/></div>
    <p>Ketersediaan mengikuti tanggal, tanpa filter periode asesmen. Status konsultasi tersimpan dapat menunggu rekonsiliasi setelah jadwal berakhir.</p>
  </>}</section>;
}
function MonitorView({ url }: { url: string }) {
  const result = useResource<{ activeParticipants: number; activePsychologists: number; assessmentsStarted: number; assessmentsCompleted: number; appointments: number }>(url);
  return <section aria-busy={result.loading}><h2>Statistik layanan</h2><p>Jumlah operasional tanpa identitas peserta atau hasil klinis. Rentang tanggal berlaku pada asesmen dan jadwal janji; jumlah akun aktif adalah jumlah saat ini. Filter periode belum didukung.</p><Feedback {...result}/>{result.data && <dl className="admin-kpis">{[["Peserta aktif", result.data.activeParticipants], ["Psikolog aktif", result.data.activePsychologists], ["Asesmen dimulai", result.data.assessmentsStarted], ["Asesmen selesai", result.data.assessmentsCompleted], ["Janji konsultasi", result.data.appointments]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</section>;
}
function PeriodPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [cursor, setCursor] = useState("");
  return <PickerPage key={cursor} cursor={cursor} value={value} onChange={onChange} onPage={setCursor}/>;
}
function PickerPage({ cursor, value, onChange, onPage }: { cursor: string; value: string; onChange: (value: string) => void; onPage: (value: string) => void }) {
  const result = useResource<PeriodPage>(`/api/admin/periods?limit=50${cursor ? `&cursor=${cursor}` : ""}`);
  return <div><label>Filter periode asesmen<select name="periodId" value={value} onChange={event => onChange(event.target.value)} disabled={result.loading || Boolean(result.error)}><option value="">Semua periode</option>{value && !result.data?.items.some(item => item.id === value) && <option value={value}>Periode terpilih</option>}{result.data?.items.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    {result.error && <><p role="alert">Daftar periode belum tersedia.</p><button type="button" onClick={result.retry}>Coba muat periode</button></>}
    {result.data?.nextCursor && <button type="button" onClick={() => onPage(result.data!.nextCursor!)}>Pilihan periode berikutnya</button>}{cursor && <button type="button" onClick={() => onPage("")}>Pilihan periode awal</button>}
  </div>;
}
function PeriodDetailView({ id }: { id: string }) {
  const result = useResource<PeriodDetail>(`/api/admin/periods/${id}`);
  return <section aria-label="Detail periode"><h3>Detail periode</h3><Feedback {...result}/>{result.data && <dl className="admin-detail"><dt>Nama</dt><dd>{result.data.name}</dd><dt>Rentang tanggal</dt><dd>{date(result.data.startDate)} – {date(result.data.endDate)}</dd><dt>Batas asesmen</dt><dd>{result.data.assessmentLimit}</dd><dt>Status</dt><dd>{labels[result.data.status]}</dd></dl>}</section>;
}
function PeriodCreate({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null), sending = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return;
    const data = new FormData(event.currentTarget), request = new AbortController(); controller.current = request;
    sending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/periods", { method: "POST", headers: { "content-type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ name: data.get("name"), startDate: data.get("startDate"), endDate: data.get("endDate"), assessmentLimit: Number(data.get("assessmentLimit")) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Periode belum dapat dikonfirmasi. Muat ulang daftar sebelum mencoba lagi.");
      if (!request.signal.aborted) onCreated();
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Penyimpanan gagal."); }
    finally { sending.current = false; if (!request.signal.aborted) setBusy(false); }
  }
  return <form className="admin-create" onSubmit={event => void submit(event)} aria-busy={busy}><h3>Siapkan periode nonaktif</h3><p>Pengujian lokal saja. Tanggal mulai harus setelah hari ini WIB. Rekaman INACTIVE tidak mengaktifkan kuota peserta.</p><fieldset disabled={busy}><legend>Informasi periode baru</legend>
    <label>Nama periode<input name="name" required maxLength={120}/></label><label>Tanggal mulai<input name="startDate" type="date" required/></label><label>Tanggal akhir<input name="endDate" type="date" required/></label><label>Batas asesmen<input name="assessmentLimit" type="number" min={0} max={2147483647} step={1} required defaultValue={3}/></label>
    <button type="submit">{busy ? "Menyimpan..." : "Simpan periode nonaktif"}</button></fieldset>{busy && <p role="status">Menunggu konfirmasi penyimpanan...</p>}{error && <p role="alert">{error}</p>}</form>;
}
function PeriodsView({ url, onNext, onFirst }: { url: string; onNext: (value: string) => void; onFirst: () => void }) {
  const result = useResource<PeriodPage>(url), [selected, setSelected] = useState(""), [saved, setSaved] = useState(false);
  return <section aria-busy={result.loading}><h2>Periode akademik</h2><p>Aktivasi, penonaktifan dan perubahan kuota periode yang sudah ada menunggu kebijakan institusi. Periode historis hanya dapat dilihat.</p><Feedback {...result}/>{saved && <p role="status">Periode nonaktif berhasil disimpan.</p>}{result.data && <>
    <p>Periode berstatus aktif: <strong>{result.data.activePeriod?.name ?? "Belum ada periode aktif"}</strong></p>
    {!result.data.items.length ? <p>Belum ada periode pada halaman ini.</p> : <div className="admin-table"><table><caption>Daftar periode akademik</caption><thead><tr><th scope="col">Nama</th><th scope="col">Tanggal</th><th scope="col">Batas asesmen</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead><tbody>{result.data.items.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{date(item.startDate)} – {date(item.endDate)}</td><td>{item.assessmentLimit}</td><td>{labels[item.status]}</td><td><button type="button" onClick={() => setSelected(item.id)}>Lihat {item.name}</button></td></tr>)}</tbody></table></div>}
    <Pagination next={result.data.nextCursor} onNext={onNext} onFirst={onFirst}/>{selected && <PeriodDetailView key={selected} id={selected}/>}
    {result.data.canCreate ? <PeriodCreate onCreated={() => { setSaved(true); result.retry(); }}/> : <p>Pembuatan periode pada production dinonaktifkan sampai proses institusi disetujui.</p>}
  </>}</section>;
}
function PsychologistsView({ url, onNext, onFirst }: { url: string; onNext: (value: string) => void; onFirst: () => void }) {
  const result = useResource<PsychologistPage>(url);
  return <section aria-busy={result.loading}><h2>Pemantauan psikolog</h2><p>Hanya akun berperan psikolog. Profil profesional dan jumlah slot untuk rentang tanggal; tidak memberi akses hasil peserta. Provisioning dan aktivasi akun memerlukan alur terkontrol terpisah.</p><Feedback {...result}/>{result.data && <>
    {!result.data.items.length ? <p>Belum ada psikolog sesuai filter.</p> : <div className="admin-table"><table><caption>Psikolog dan kapasitas jadwal</caption><thead><tr><th scope="col">Psikolog</th><th scope="col">Profil profesional</th><th scope="col">Status akun</th><th scope="col">Tersedia</th><th scope="col">Dipesan</th><th scope="col">Tidak tersedia</th></tr></thead><tbody>{result.data.items.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.profile ? <>{item.profile.professionalTitle || "Gelar belum diisi"}<br/>{item.profile.qualification}<br/>{item.profile.areasOfFocus.join(", ")}<br/>{item.profile.languages.join(", ")}<br/>{item.profile.consultationMethod}</> : "Profil belum dilengkapi"}</td><td>{item.active ? "Aktif" : "Nonaktif"}</td>{["AVAILABLE", "BOOKED", "UNAVAILABLE"].map(status => <td key={status}>{item.availability.find(row => row.status === status)?.count ?? 0}</td>)}</tr>)}</tbody></table></div>}
    <Pagination next={result.data.nextCursor} onNext={onNext} onFirst={onFirst}/>
  </>}</section>;
}
function AppointmentsView({ url, onNext, onFirst }: { url: string; onNext: (value: string) => void; onFirst: () => void }) {
  const result = useResource<AppointmentPage>(url);
  return <section aria-busy={result.loading}><h2>Pengawasan janji</h2><p>Pemantauan hanya baca, tanpa identitas peserta, laporan, isi consent atau percakapan. Tidak ada tindakan pembatalan, penjadwalan ulang atau membuka sesi.</p><Feedback {...result}/>{result.data && <>
    {!result.data.items.length ? <p>Belum ada janji sesuai filter.</p> : <div className="admin-table"><table><caption>Jadwal janji konsultasi</caption><thead><tr><th scope="col">Jadwal WIB</th><th scope="col">Psikolog</th><th scope="col">Status janji</th><th scope="col">Status sesi tersimpan</th></tr></thead><tbody>{result.data.items.map((item, index) => <tr key={`${item.scheduledStartAt}-${index}`}><td>{dateTime(item.scheduledStartAt)} – {dateTime(item.scheduledEndAt)}</td><td>{item.psychologistName}</td><td>{labels[item.status]}</td><td>{item.consultationStatus ? labels[item.consultationStatus] : "Belum tercatat"}</td></tr>)}</tbody></table></div>}
    <Pagination next={result.data.nextCursor} onNext={onNext} onFirst={onFirst}/>
  </>}</section>;
}
export function AdminConsole({ today, from }: { today: string; from: string }) {
  const [tab, setTab] = useState<Tab>("overview"), [period, setPeriod] = useState(""), [cursor, setCursor] = useState("");
  const [filters, setFilters] = useState({ from, to: today, periodId: "", active: "all", status: "" });
  function changeTab(value: Tab) { setTab(value); setCursor(""); }
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setFilters({ from: String(data.get("from")), to: String(data.get("to")), periodId: period, active: String(data.get("active") ?? "all"), status: String(data.get("status") ?? "") }); setCursor("");
  }
  const params = new URLSearchParams();
  if (tab !== "periods") { params.set("from", filters.from); params.set("to", filters.to); }
  if ((tab === "overview" || tab === "appointments") && filters.periodId) params.set("periodId", filters.periodId);
  if (tab === "psychologists") params.set("active", filters.active);
  if (tab === "appointments" && filters.status) params.set("status", filters.status);
  if (tab !== "overview" && tab !== "monitor") params.set("limit", "10");
  if (cursor && tab !== "overview" && tab !== "monitor") params.set("cursor", cursor);
  const url = `/api/admin/${tab}?${params}`, paging = { onNext: setCursor, onFirst: () => setCursor("") };
  return <main className="admin-console"><h1>Operasional KKA</h1><p>Ringkasan layanan dan pengelolaan jadwal WellBeing Hub.</p><div className="admin-notice">Indikator kesehatan mental dinonaktifkan sampai ambang privasi dan aturan pengungkapan disetujui. Tidak ada akses otomatis ke hasil individual, PDF atau chat.</div>
    <nav aria-label="Navigasi administrator">{tabs.map(item => <button key={item.key} type="button" aria-current={tab === item.key ? "page" : undefined} onClick={() => changeTab(item.key)}>{item.label}</button>)}</nav>
    {!["periods", "users", "audit"].includes(tab) && <form key={tab} className="admin-filters" onSubmit={apply}><label>Dari tanggal<input name="from" type="date" required defaultValue={filters.from}/></label><label>Sampai tanggal<input name="to" type="date" required defaultValue={filters.to}/></label>
      {(tab === "overview" || tab === "appointments") && <PeriodPicker value={period} onChange={setPeriod}/>}
      {tab === "psychologists" && <div><label htmlFor="admin-account-status">Status akun</label><select id="admin-account-status" name="active" defaultValue={filters.active}><option value="all">Semua akun</option><option value="true">Aktif</option><option value="false">Nonaktif</option></select></div>}
      {tab === "appointments" && <div><label htmlFor="admin-appointment-status">Status janji</label><select id="admin-appointment-status" name="status" defaultValue={filters.status}><option value="">Semua status</option>{["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "RESCHEDULED", "NO_SHOW"].map(status => <option key={status} value={status}>{labels[status]}</option>)}</select></div>}
      <button type="submit">Terapkan filter</button><small>Maksimal 93 hari, batas hari inklusif dalam WIB. Filter periode berlaku pada asesmen serta janji/konsultasi yang terkait asesmen tersebut.</small></form>}
    {tab === "overview" && <div className="admin-notice">Ringkasan lengkap membutuhkan proyeksi operasional tambahan. <button type="button" onClick={() => changeTab("monitor")}>Lihat statistik layanan</button></div>}
    {tab === "monitor" ? <MonitorView key={url} url={url}/> : tab === "users" ? <section><h2>Kelola akun, bukan laporan pribadi.</h2><p>Perubahan peran, undangan psikolog, dan aktivasi akun membutuhkan proses persetujuan institusi. Tindakan ini belum tersedia melalui aplikasi.</p><div className="admin-notice">Akses administrator tidak mencakup hasil asesmen individual. Tidak ada perubahan akun yang dilakukan dari halaman ini.</div><button onClick={() => changeTab("psychologists")}>Lihat pemantauan psikolog</button></section> : tab === "audit" ? <section><h2>Akuntabilitas tanpa membuka data pribadi.</h2><p>UI pengawasan consent dan ekspor metadata audit menunggu gateway yang disetujui. Tidak ada isi laporan, jawaban asesmen, atau percakapan yang ditampilkan.</p><div className="admin-notice">Administrator tidak dapat memberikan persetujuan atas nama peserta atau memulihkan izin yang dicabut.</div><button onClick={() => changeTab("appointments")}>Lihat pengawasan janji</button></section> : tab === "overview" ? <OverviewView key={url} url={url}/> : tab === "periods" ? <PeriodsView key={url} url={url} {...paging}/> : tab === "psychologists" ? <PsychologistsView key={url} url={url} {...paging}/> : <AppointmentsView key={url} url={url} {...paging}/>}
  </main>;
}
