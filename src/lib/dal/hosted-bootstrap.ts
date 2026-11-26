import "server-only";
import { PrismaClient } from "@prisma/client";
import { installHostedRuntime } from "./context";
import { httpsService, stagingDatabase, stagingProject } from "./staging-config";

export async function verifyRestrictedRole(client: PrismaClient, expected: "website_runtime" | "wb_pdf_worker") {
  const [role] = await client.$queryRaw<Array<{ safe: boolean }>>`SELECT session_user=${expected} AND NOT(rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid AND relnamespace='public'::regnamespace) AND NOT EXISTS(SELECT 1 FROM pg_roles t WHERE t.oid<>r.oid AND pg_has_role(r.oid,t.oid,'SET')) AS safe FROM pg_roles r WHERE rolname=session_user`;
  if (!role?.safe) throw new Error("UNSAFE_RUNTIME");
}

export async function installStagingRuntime() {
  const { ref, audience } = stagingProject();
  const endpoint = httpsService(process.env.WELLBEING_SIGNER_URL);
  const token = process.env.WELLBEING_SIGNER_TOKEN;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error("SIGNER_CONFIGURATION_REQUIRED");
  const client = new PrismaClient({ datasources: { db: { url: stagingDatabase(process.env.DATABASE_URL, "website_runtime", ref) } }, log: [] });
  try {
    await verifyRestrictedRole(client, "website_runtime");
    await installHostedRuntime(client, audience, async (payload, accessToken) => {
      if (!accessToken) throw new Error("AUTH_REQUIRED");
      const response = await fetch(new URL("sign", endpoint), { method: "POST", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(5000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payload, accessToken }) });
      if (!response.ok) throw new Error("SIGNER_UNAVAILABLE");
      const result = await response.json();
      if (typeof result.mac !== "string" || !/^[a-f0-9]{64}$/.test(result.mac)) throw new Error("SIGNER_UNAVAILABLE");
      return result.mac;
    });
  } catch { await client.$disconnect(); throw new Error("STAGING_RUNTIME_UNAVAILABLE"); }
}
