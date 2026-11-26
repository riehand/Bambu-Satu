// Build only: no network, credential loading, process startup or provisioning.
import { build } from "esbuild";
import { resolve } from "node:path";
await build({ entryPoints: { signer: "src/lib/dal/staging-signer-server.ts", "pdf-worker": "src/lib/reports/staging-worker-server.ts" },
  outdir: "build/staging", bundle: true, platform: "node", format: "cjs", outExtension: { ".js": ".cjs" }, packages: "external",
  alias: { "@": resolve("src") },
  plugins: [{ name: "standalone-server-only", setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "server-marker" }));
    builder.onLoad({ filter: /.*/, namespace: "server-marker" }, () => ({ contents: "", loader: "js" }));
  } }],
});
