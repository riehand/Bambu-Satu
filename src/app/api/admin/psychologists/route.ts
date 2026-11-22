import { adminApi, adminQuery } from "@/lib/admin/http";
import { adminPsychologists } from "@/lib/admin/service";
import { psychologistQuery } from "@/lib/validations/admin";
export async function GET(request: Request) {
  return adminApi(id => adminPsychologists(id, psychologistQuery.parse(adminQuery(request))));
}
