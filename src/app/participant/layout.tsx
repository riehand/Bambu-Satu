import { requirePageRole } from "@/lib/auth/session";
import { ParticipantShell } from "@/components/participant/shell";
import "./participant.css";
import { Suspense } from "react";
import Loading from "./loading";
async function AuthenticatedParticipantLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePageRole("PARTICIPANT");
  return <ParticipantShell fullName={profile.fullName} userType={profile.userType}>{children}</ParticipantShell>;
}
export default function ParticipantLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading/>}><AuthenticatedParticipantLayout>{children}</AuthenticatedParticipantLayout></Suspense>;
}
