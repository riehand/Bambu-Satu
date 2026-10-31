import { NextResponse } from "next/server";
import { isSameOrigin, privateHeaders } from "@/lib/auth/http";
import { requireApiRole } from "@/lib/auth/session";
import { reportErrorResponse } from "@/lib/reports/http";
import { generateReportForParticipant, ReportError } from "@/lib/reports/service";
import { reportIdSchema } from "@/lib/validations/appointment";

export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const participant = await requireApiRole("PARTICIPANT");
    if (!isSameOrigin(request)) throw new ReportError("INVALID_ORIGIN", 403);
    const reportId = reportIdSchema.parse((await context.params).reportId);
    const data = await generateReportForParticipant(participant.id, reportId);
    return NextResponse.json({ success: true, data }, { headers: privateHeaders });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
