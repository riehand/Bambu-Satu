// Offline worker build: no dotenv, network, account creation or deployment.
import { build } from "esbuild";
import { access, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const destination = "build/hosted-worker";
const fonts = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"];
for (const font of fonts) await access(`public/fonts/${font}`);
await build({
  entryPoints: ["src/lib/reports/staging-worker-server.ts"],
  outfile: `${destination}/pdf-worker.cjs`, bundle: true,
  platform: "node", target: "node22", format: "cjs", packages: "external",
  alias: { "@": resolve("src") },
  plugins: [{ name: "standalone-server-only", setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "marker" }));
    builder.onLoad({ filter: /.*/, namespace: "marker" }, () => ({ contents: "", loader: "js" }));
  } }],
});
await mkdir(`${destination}/public/fonts`, { recursive: true });
for (const font of fonts) await copyFile(`public/fonts/${font}`, `${destination}/public/fonts/${font}`);
console.log("Hosted PDF worker built with fonts. No service started or deployed.");
