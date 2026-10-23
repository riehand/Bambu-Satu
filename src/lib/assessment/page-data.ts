import "server-only";
import { unstable_rethrow } from "next/navigation";
import { publicAssessmentError } from "./http";

export async function loadAssessmentData<T>(load: () => Promise<T>): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try { return { data: await load(), error: null }; }
  catch (error) { unstable_rethrow(error); return { data: null, error: publicAssessmentError(error).message }; }
}
