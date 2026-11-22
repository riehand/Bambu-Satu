import { adminApi, adminQuery } from "@/lib/admin/http";
import { adminAppointments } from "@/lib/admin/service";
import { appointmentQuery } from "@/lib/validations/admin";
export async function GET(request: Request) {
  return adminApi(id => adminAppointments(id, appointmentQuery.parse(adminQuery(request))));
}
