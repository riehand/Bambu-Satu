import { expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { installHostedRuntime, withVerifiedDatabaseRequest, databaseTransaction } from "@/lib/dal/context";

it("forwards the exact verified access token into a transaction-bound staging claim; invalid Auth never reaches SQL", async () => {
  vi.stubEnv("WELLBEING_RUNTIME", "staging");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", undefined);
  const id = "00000000-0000-4000-8000-000000000001";
  const query = vi.fn().mockResolvedValueOnce([{ pid: 123, tx: "456", epoch: BigInt(Math.floor(Date.now() / 1000)) }])
    .mockResolvedValueOnce([]).mockResolvedValueOnce([{ id, role: "PARTICIPANT" }]);
  const tx = { $queryRaw: query };
  const transaction = vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const sign = vi.fn().mockResolvedValue("b".repeat(64));
  const audience = "wellbeing-staging-abcdefghijklmnopqrst-v1";
  try {
    await installHostedRuntime({ $transaction: transaction } as unknown as PrismaClient, audience, sign);
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: "synthetic-token" } }, error: null });
    await expect(withVerifiedDatabaseRequest({ getSession, getUser: async () => ({ data: { user: null }, error: "invalid" }) }, async () => databaseTransaction(async () => "forbidden"))).rejects.toThrow("AUTH_REQUIRED");
    expect(transaction).not.toHaveBeenCalled();
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id, email_confirmed_at: "confirmed" } }, error: null });
    expect(await withVerifiedDatabaseRequest({ getSession, getUser }, () => databaseTransaction(async () => "allowed"))).toBe("allowed");
    expect(getUser).toHaveBeenCalledWith("synthetic-token");
    expect(sign).toHaveBeenCalledWith(expect.any(String), "synthetic-token");
    expect(JSON.parse(sign.mock.calls[0][0])).toMatchObject({ sub: id, aud: audience, pid: "123", tx: "456", purpose: "interactive" });
  } finally { vi.unstubAllEnvs(); }
});
