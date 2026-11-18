import { StrictMode, useState } from "react";
import { ReportDownload } from "@/components/participant/report-download";
import { fixtureId } from "../fixtures/assessment";

function ReportControls({ initiallyGenerated }: { initiallyGenerated: boolean }) {
  const [reportId, setReportId] = useState(fixtureId(950));
  const [status, setStatus] = useState<"PENDING" | "GENERATED">(initiallyGenerated ? "GENERATED" : "PENDING");
  const [visible, setVisible] = useState(true);
  const [renders, setRenders] = useState(0);
  return <section className="wb-card">
    <div className="wb-actions">
      <button onClick={() => setReportId(fixtureId(950))}>Laporan A</button>
      <button onClick={() => setReportId(fixtureId(951))}>Laporan B</button>
      <button onClick={() => setStatus("PENDING")}>Status PENDING</button>
      <button onClick={() => setStatus("GENERATED")}>Status GENERATED</button>
      <button onClick={() => setVisible((value) => !value)}>{visible ? "Tutup laporan" : "Tampilkan laporan"}</button>
      <button onClick={() => setRenders((value) => value + 1)}>Render ulang</button>
    </div>
    <p>Render fixture: {renders}</p>
    {visible && <ReportDownload reportId={reportId} reportStatus={status}/>}
  </section>;
}

// Exercise development effect replay as well as prop changes without remounting the fixture.
export function ReportDownloadFixture({ initiallyGenerated }: { initiallyGenerated: boolean }) {
  return <StrictMode><ReportControls initiallyGenerated={initiallyGenerated}/></StrictMode>;
}
