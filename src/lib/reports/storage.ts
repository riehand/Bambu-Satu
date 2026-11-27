import "server-only";
import { createClient } from "@supabase/supabase-js";
import { hostedStorageClient } from "./hosted-storage";

const bucket = "assessment-reports";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ReportStorageError extends Error {
  constructor(readonly kind: "conflict" | "unavailable") {
    super(kind);
  }
}

let storageClient: ReturnType<typeof createClient> | undefined;

function client() {
  if (["hosted", "staging"].includes(process.env.WELLBEING_RUNTIME ?? "")) return hostedStorageClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new ReportStorageError("unavailable");
  // Legacy secret-backed adapter is retained only for optional loopback fixtures.
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new ReportStorageError("unavailable");
  if (storageClient) return storageClient;
  storageClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
  });
  return storageClient;
}

export function reportObjectKeyFor(reportId: string) {
  if (!UUID.test(reportId)) throw new ReportStorageError("unavailable");
  return `reports/${reportId.toLowerCase()}.pdf`;
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { status: undefined, code: undefined };
  const value = error as { status?: number; statusCode?: string; code?: string };
  return { status: Number(value.status ?? value.statusCode), code: value.code ?? value.statusCode };
}

export async function downloadReportObject(reportId: string) {
  try {
    const { data, error } = await client().storage.from(bucket).download(reportObjectKeyFor(reportId));
    if (error) {
      const details = errorDetails(error);
      if (details.status === 404 || details.code === "NoSuchKey" || details.code === "NotFound") return null;
      throw new ReportStorageError(details.status === 409 || details.code === "ResourceAlreadyExists" ? "conflict" : "unavailable");
    }
    return new Uint8Array(await data.arrayBuffer());
  } catch (error) {
    if (error instanceof ReportStorageError) throw error;
    throw new ReportStorageError("unavailable");
  }
}

export async function uploadReportObject(reportId: string, bytes: Uint8Array) {
  try {
    const { error } = await client().storage.from(bucket).upload(reportObjectKeyFor(reportId), bytes, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false,
    });
    if (error) {
      const details = errorDetails(error);
      throw new ReportStorageError(details.status === 409 || details.code === "ResourceAlreadyExists" ? "conflict" : "unavailable");
    }
  } catch (error) {
    if (error instanceof ReportStorageError) throw error;
    throw new ReportStorageError("unavailable");
  }
}
