import { requirePageRole } from "@/lib/auth/session";
import { AdminConsole } from "@/components/admin/console";
import { LogoutButton } from "@/components/logout-button";
import { jakartaDate } from "@/lib/psychologist/availability-config";

export default async function AdminDashboard() {
  const profile = await requirePageRole("SUPERADMIN");
  const now = new Date();
  return <div className="admin-page"><header className="admin-header"><strong>WellBeing Hub · KKA</strong><span>{profile.fullName}</span><LogoutButton/></header><AdminConsole today={jakartaDate(now)} from={jakartaDate(new Date(now.getTime() - 29 * 86400000))}/></div>;
}
