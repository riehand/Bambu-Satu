import { adminApi, adminQuery } from "@/lib/admin/http";
import { adminPeriod } from "@/lib/admin/service";
import { adminId } from "@/lib/validations/admin";
import { z } from "zod";
export async function GET(request: Request, context: { params: Promise<{ periodId: string }> }) {
  return adminApi(async id => {
    z.object({}).strict().parse(adminQuery(request));
    return adminPeriod(id, adminId.parse((await context.params).periodId));
  });
}
