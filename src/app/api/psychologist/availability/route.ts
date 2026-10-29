import { psychologistApi, readAvailabilityRange } from "@/lib/psychologist/http";
import { listOwnAvailability } from "@/lib/psychologist/service";

export function GET(request: Request) {
  return psychologistApi("PSYCHOLOGIST", async (psychologistId) => ({
    data: await listOwnAvailability(psychologistId, readAvailabilityRange(request)),
  }));
}
