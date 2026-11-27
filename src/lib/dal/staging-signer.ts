import "server-only";
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";

const claimSchema = z.object({ aud: z.string(), sub: z.string().uuid(), pid: z.string().regex(/^[1-9][0-9]*$/),
  tx: z.string().regex(/^[1-9][0-9]*$/), iat: z.number().int(), exp: z.number().int(), purpose: z.literal("interactive") }).strict();

// Auth is pinned to staging by the service bootstrap. Never sign a caller-supplied
// subject until the supplied access token has independently been verified by Auth.
export function stagingSigner(audience: string, key: string,
  verify: (token: string) => Promise<{ id: string; email_confirmed_at?: string | null } | null>) {
  if (!/^[a-f0-9]{64}$/.test(key) || !/^wellbeing-(staging|hosted)-[a-z0-9]{20}-v1$/.test(audience)) throw new Error("SIGNER_CONFIGURATION_REQUIRED");
  return async (payload: string, accessToken: string) => {
    if (payload.length > 2048 || !accessToken || accessToken.length > 8192) throw new Error("INVALID_REQUEST");
    const claim = claimSchema.parse(JSON.parse(payload));
    const user = await verify(accessToken);
    const now = Math.floor(Date.now() / 1000);
    if (!user?.email_confirmed_at || user.id !== claim.sub || claim.aud !== audience
      || claim.iat > now + 5 || claim.iat < now - 30 || claim.exp <= now
      || claim.exp - claim.iat !== 30) throw new Error("INVALID_IDENTITY");
    return createHmac("sha256", Buffer.from(key, "hex")).update(payload).digest("hex");
  };
}
