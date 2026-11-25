import "server-only";
import { unstable_rethrow } from "next/navigation";
import { publicAssessmentError } from "./http";
import { withApplicationDatabase } from "@/lib/auth/session";

export async function loadAssessmentData<T>(load: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  // Each Server Component executes independently of its layout. Keep all reads
  // in this loader inside a verified request, including parallel/nested reads.
  try { return { data: await withApplicationDatabase(load), error: null }; }
  catch (error) { unstable_rethrow(error); return { data: null, error: publicAssessmentError(error).message }; }
}
