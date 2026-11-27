import "server-only";
import { createServer, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

// Deploy behind TLS ingress. Caller binds loopback or an explicitly configured
// managed-provider interface; every HTTP path still requires the service token.
export function stagingHttp(token: string, handler: (path: string, body: unknown, response: ServerResponse) => Promise<void>) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("SERVICE_TOKEN_REQUIRED");
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const supplied = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (request.method !== "POST" || !/^[a-f0-9]{64}$/.test(supplied)
      || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) { response.writeHead(403).end(); return; }
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 16384) throw new Error("BODY_TOO_LARGE");
      }
      await handler(request.url ?? "", JSON.parse(body), response);
    } catch { response.writeHead(503, { "Retry-After": "10" }).end(); }
  });
  server.requestTimeout = 45000;
  server.headersTimeout = 10000;
  return server;
}
