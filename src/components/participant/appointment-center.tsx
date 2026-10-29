"use client";

import { useCallback, useEffect, useState } from "react";

type Appointment = {
  appointmentId: string; status: string; scheduledStartAt: string; scheduledEndAt: string;
  psychologist: { id: string; fullName: string }; sessionType: string; reportId: string; canReconsent: boolean;
};
type Consent = {
  consentId: string; reportId: string; targetUserId: string; appointmentId: string | null;
  consentType: "APPOINTMENT_REPORT_ACCESS" | "STANDALONE_REPORT_ACCESS"; grantedAt: string;
  expiresAt: string | null; expiredAt: string | null; revokedAt: string | null; active: boolean;
};
type BookingContext = { latestAssessment: null | { assessmentSessionId: string; completedAt: string; reportId: string; reportStatus: string }; canBook: boolean };
type Psychologist = { id: string; fullName: string };

const indonesiaTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));

export function AppointmentCenter() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [context, setContext] = useState<BookingContext | null>(null);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [psychologistId, setPsychologistId] = useState("");
  const [standaloneConsent, setStandaloneConsent] = useState(false);
  const [reconsentChecks, setReconsentChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");

  const fetchCenterData = useCallback(async () => {
    const responses = await Promise.all([
      fetch("/api/appointments"),
      fetch("/api/consents"),
      fetch("/api/appointments/booking-context"),
      fetch("/api/psychologists?page=1&limit=50"),
    ]);
    const results = await Promise.all(responses.map(async (response) => ({ response, body: await response.json() })));
    if (results.some(({ response, body }) => !response.ok || !body.success)) throw new Error("Data janji atau persetujuan belum dapat dimuat.");
    return {
      appointments: results[0].body.data as Appointment[],
      consents: results[1].body.data as Consent[],
      context: results[2].body.data as BookingContext,
      psychologists: results[3].body.data.items as Psychologist[],
    };
  }, []);

  const applyCenterData = useCallback((data: Awaited<ReturnType<typeof fetchCenterData>>) => {
    setAppointments(data.appointments);
    setConsents(data.consents);
    setContext(data.context);
    setPsychologists(data.psychologists);
  }, []);

  const refresh = useCallback(async () => {
    try { applyCenterData(await fetchCenterData()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Data belum dapat dimuat."); }
  }, [applyCenterData, fetchCenterData]);

  useEffect(() => {
    let active = true;
    void fetchCenterData().then((data) => { if (active) applyCenterData(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Data belum dapat dimuat."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applyCenterData, fetchCenterData]);

  async function revoke(consent: Consent) {
    setPending(consent.consentId);
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/consents/${consent.consentId}/revoke`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Persetujuan belum dapat dicabut.");
      setConsents((current) => current.map((item) => item.consentId === consent.consentId ? { ...item, revokedAt: result.data.revokedAt, active: false } : item));
      setMessage("Persetujuan dicabut. Janji konsultasi tetap berjalan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Persetujuan belum dapat dicabut."); }
    finally { setPending(""); }
  }

  async function grantStandalone() {
    if (!context?.canBook || !context.latestAssessment || !psychologistId || !standaloneConsent) return;
    setPending("standalone"); setError(""); setMessage("");
    setStandaloneConsent(false);
    try {
      const response = await fetch("/api/consents/psychologist-report", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessmentSessionId: context.latestAssessment.assessmentSessionId, reportId: context.latestAssessment.reportId, psychologistId, consent: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Persetujuan belum dapat diberikan.");
      setMessage("Akses laporan mandiri diberikan kepada psikolog yang dipilih.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Persetujuan belum dapat diberikan."); }
    finally { setPending(""); }
  }

  async function reconsent(appointment: Appointment) {
    if (!reconsentChecks[appointment.appointmentId]) return;
    setPending(appointment.appointmentId); setError(""); setMessage("");
    setReconsentChecks((current) => ({ ...current, [appointment.appointmentId]: false }));
    try {
      const response = await fetch(`/api/appointments/${appointment.appointmentId}/report-consent`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Persetujuan baru belum dapat diberikan.");
      setMessage("Persetujuan laporan baru telah dicatat.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Persetujuan baru belum dapat diberikan."); }
    finally { setPending(""); }
  }

  const isActive = (consent: Consent) => consent.active;
  if (loading) return <p className="wb-muted" role="status">Memuat janji konsultasi...</p>;
  return <div className="wb-appointment-center">
    {error && <p className="wb-error" role="alert">{error}</p>}
    {message && <p className="wb-success" role="status">{message}</p>}

    <section className="wb-card">
      <h2>Janji konsultasi</h2>
      {appointments.length ? <div className="wb-appointment-list">{appointments.map((appointment) => {
        const grant = consents.find((item) => item.appointmentId === appointment.appointmentId && item.consentType === "APPOINTMENT_REPORT_ACCESS");
        const active = grant ? isActive(grant) : false;
        const eligible = appointment.canReconsent;
        return <article className="wb-appointment-row" key={appointment.appointmentId}>
          <div><h3>{appointment.psychologist.fullName}</h3><p>{indonesiaTime(appointment.scheduledStartAt)} · {appointment.sessionType}</p><small>Status janji: {appointment.status} · Akses laporan {active ? "aktif" : "tidak aktif"}</small></div>
          {grant && active ? <button className="wb-button secondary" type="button" disabled={pending === grant.consentId} onClick={() => void revoke(grant)}>Cabut persetujuan laporan</button> : grant && !grant.revokedAt && !grant.expiredAt ? <span className="wb-muted">Akses laporan berakhir pada waktu yang dijadwalkan.</span> : null}
          {grant?.revokedAt && eligible && <div className="wb-reconsent"><label><input type="checkbox" checked={Boolean(reconsentChecks[appointment.appointmentId])} disabled={pending === appointment.appointmentId} onChange={(event) => setReconsentChecks((current) => ({ ...current, [appointment.appointmentId]: event.target.checked }))}/>Saya setuju kembali membagikan laporan ini kepada {appointment.psychologist.fullName} untuk janji ini.</label><button className="wb-button secondary" type="button" disabled={!reconsentChecks[appointment.appointmentId] || pending === appointment.appointmentId} onClick={() => void reconsent(appointment)}>Berikan persetujuan baru</button></div>}
        </article>;
      })}</div> : <p className="wb-muted">Belum ada janji konsultasi.</p>}
    </section>

    <section className="wb-card">
      <h2>Persetujuan laporan mandiri</h2>
      <p className="wb-muted">Izin ini berdiri sendiri dan tidak membuat atau mengubah janji konsultasi.</p>
      {context?.canBook && context.latestAssessment ? <div className="wb-standalone-form">
        <label className="wb-availability-date"><span>Psikolog penerima</span><select value={psychologistId} onChange={(event) => setPsychologistId(event.target.value)}><option value="">Pilih psikolog</option>{psychologists.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
        <label className="wb-report-consent"><input type="checkbox" checked={standaloneConsent} disabled={pending === "standalone"} onChange={(event) => setStandaloneConsent(event.target.checked)}/><span>Saya setuju membagikan laporan asesmen terbaru secara mandiri kepada psikolog yang dipilih. Izin ini tidak terkait janji dan tetap berlaku sampai saya mencabutnya.</span></label>
        <button className="wb-button" type="button" disabled={!psychologistId || !standaloneConsent || pending === "standalone"} onClick={() => void grantStandalone()}>{pending === "standalone" ? "Menyimpan..." : "Berikan akses mandiri"}</button>
      </div> : <p className="wb-muted">Laporan asesmen terbaru belum berstatus GENERATED. Akses mandiri dapat diberikan setelah artifact laporan privat tersedia.</p>}
      <div className="wb-consent-list">{consents.filter((item) => item.consentType === "STANDALONE_REPORT_ACCESS").map((consent) => {
        const person = psychologists.find(({ id }) => id === consent.targetUserId);
        return <article className="wb-consent-row" key={consent.consentId}><div><strong>{person?.fullName ?? "Psikolog"}</strong><small>Laporan {consent.reportId} · {isActive(consent) ? "Aktif" : consent.revokedAt ? "Dicabut" : "Berakhir"}</small></div>{isActive(consent) && <button className="wb-button secondary" type="button" disabled={pending === consent.consentId} onClick={() => void revoke(consent)}>Cabut akses</button>}</article>;
      })}</div>
    </section>
  </div>;
}
