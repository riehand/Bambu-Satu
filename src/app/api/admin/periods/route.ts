import { adminApi, adminQuery, adminJson } from "@/lib/admin/http";
import { adminPeriods, createInactivePeriod } from "@/lib/admin/service";
import { periodQuery, periodCommand } from "@/lib/validations/admin";
export async function GET(request: Request) {
  return adminApi(id => adminPeriods(id, periodQuery.parse(adminQuery(request))));
}
export async function POST(request: Request) {
  return adminApi(async id => createInactivePeriod(id, periodCommand.parse(await adminJson(request))), request);
}
