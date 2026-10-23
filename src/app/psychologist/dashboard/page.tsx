import { requirePageRole } from "@/lib/auth/session";
import { RolePlaceholder } from "@/components/role-placeholder";

export default async function PsychologistDashboard() {
  const profile = await requirePageRole("PSYCHOLOGIST");
  return <RolePlaceholder title="Psychologist Dashboard" name={profile.fullName} />;
}
