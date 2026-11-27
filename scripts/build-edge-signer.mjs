// Offline bundle only. Does not load credentials or deploy a function.
import { build } from "esbuild";
await build({ stdin: { contents: `import { createEdgeSignerHandler } from './src/lib/dal/edge-signer-handler';
Deno.serve(createEdgeSignerHandler({ projectRef: Deno.env.get('WELLBEING_HOSTED_PROJECT_REF'),
authUrl: Deno.env.get('SUPABASE_URL'), publishableKey: Deno.env.get('WELLBEING_AUTH_PUBLISHABLE_KEY'),
signingKey: Deno.env.get('WELLBEING_IDENTITY_SIGNING_KEY') }));`, resolveDir: process.cwd() },
  outfile: "build/edge-signer/index.js", bundle: true, format: "esm", platform: "neutral", target: "es2022",
  mainFields: ["module", "main"], external: ["node:crypto", "node:buffer"],
  plugins: [{ name: "hosted-server-only", setup(b) {
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "marker" }));
    b.onLoad({ filter: /.*/, namespace: "marker" }, () => ({ contents: "", loader: "js" }));
  } }],
});
