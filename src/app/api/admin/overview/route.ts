import { adminApi, adminQuery } from "@/lib/admin/http";
import { adminOverview } from "@/lib/admin/service";
import { overviewQuery } from "@/lib/validations/admin";
export async function GET(request: Request) {
  return adminApi(id => adminOverview(id, overviewQuery.parse(adminQuery(request))));
}
