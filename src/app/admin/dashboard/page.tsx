import { requirePageRole } from "@/lib/auth/session";
import { RolePlaceholder } from "@/components/role-placeholder";

export default async function AdminDashboard() {
  const profile = await requirePageRole("SUPERADMIN");
  return <RolePlaceholder title="Admin Dashboard" name={profile.fullName} />;
}
