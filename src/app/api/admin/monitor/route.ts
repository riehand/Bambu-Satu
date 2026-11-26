import { adminApi, adminQuery } from "@/lib/admin/http";
import { adminRestrictedOverview } from "@/lib/admin/service";
import { overviewQuery } from "@/lib/validations/admin";
export async function GET(request: Request) {
  return adminApi(id => adminRestrictedOverview(id, overviewQuery.parse(adminQuery(request))));
}
