// This Vite-only harness is outside src/app and is never served by Next.js.
// No authentication bypass, Supabase connection or production fixture route.
import { createRoot } from "react-dom/client";
import { ParticipantShell } from "@/components/participant/shell";
import { DashboardView } from "@/components/participant/dashboard";
import { Introduction } from "@/components/participant/introduction";
import { Questionnaire } from "@/components/participant/questionnaire";
import { ResultsView } from "@/components/participant/results";
import { HistoryList } from "@/components/participant/ui";
import Loading from "@/app/participant/loading";
import { syntheticQuestionSet, fixtureId } from "../fixtures/assessment";
import "@/app/participant/participant.css";
import "./reset.css";
const query=new URLSearchParams(location.search), view=query.get("view")??"dashboard", state=query.get("state")??"empty";
const set=syntheticQuestionSet();
const quota={academicPeriod:{id:fixtureId(400),name:"Periode sintetis untuk pengujian"},limit:3,
  completed:state==="exhausted"?3:state==="populated"?2:0,remaining:state==="exhausted"?0:state==="populated"?1:3,
  inProgressSessionId:state==="in-progress"?fixtureId(300):null,
  inProgress:state==="in-progress"?{answered:23,total:35,updatedAt:"2026-10-24T03:24:00Z"}:null,
  availability:state==="content-unavailable"?{code:"INSTRUMENT_CONTENT_UNAVAILABLE",message:"Materi asesmen masih dalam proses persetujuan. Silakan kembali nanti."}:null};
const scores={depressionScore:8,depressionCategory:"NORMAL" as const,anxietyScore:10,anxietyCategory:"MODERATE" as const,stressScore:18,stressCategory:"MILD" as const,wemwbsScore:49};
const history=[0,1,2].map(i=>({assessmentSessionId:fixtureId(300+i),completedAt:`2026-10-${23-i}T03:24:00Z`,reportId:fixtureId(800+i),scores:{...scores,wemwbsScore:49-i*3}}));
const answers=state==="wemwbs"?set.questions.slice(0,21).map(q=>({questionId:q.id,answerValue:1})):state==="review"?set.questions.map(q=>({questionId:q.id,answerValue:1})):state==="saved"?[{questionId:set.questions[0].id,answerValue:1}]:[];
const persisted=JSON.parse(sessionStorage.getItem("synthetic-answers")??"null") as typeof answers|null;
const unavailable=state==="unavailable"?"Belum ada periode akademik aktif. Asesmen belum tersedia.":null;
let content;
if(view==="loading") content=<Loading/>;
else if(view==="introduction") content=<Introduction quota={unavailable?null:quota} error={unavailable}/>;
else if(view==="questionnaire") content=<Questionnaire sessionId={fixtureId(300)} initialRevision={Number(sessionStorage.getItem("synthetic-revision")??0)} initialAnswers={persisted??answers} questions={set.questions} dassInstructions={set.dassInstructions} wemwbsInstructions={set.wemwbsInstructions} dassOptions={set.dassOptions as {value:number;label:string}[]} wemwbsOptions={set.wemwbsOptions as {value:number;label:string}[]}/>;
else if(view==="results") content=<ResultsView sessionId={fixtureId(300)} completedAt="2026-10-23T03:24:00Z" reportId={fixtureId(800)} scores={scores} history={history}/>;
else if(view==="history") content=<HistoryList history={state==="populated"?history:[]}/>;
else content=<DashboardView fullName="Peserta Uji Sintetis" quota={unavailable?null:quota} quotaError={unavailable} history={state==="populated"?history:[]} historyError={null}/>;
createRoot(document.getElementById("root")!).render(<><ParticipantShell fullName="Peserta Uji Sintetis" userType="STUDENT">{content}</ParticipantShell><div className="fixture-label">FIXTURE SINTETIS · BUKAN ASESMEN KLINIS</div></>);
