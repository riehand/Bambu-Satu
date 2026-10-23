import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
export default defineConfig({
  root:fileURLToPath(new URL(".",import.meta.url)),
  resolve:{alias:{"@":fileURLToPath(new URL("../../src",import.meta.url)),"next/link":fileURLToPath(new URL("./next-link.tsx",import.meta.url)),"next/navigation":fileURLToPath(new URL("./next-navigation.ts",import.meta.url))}},
  esbuild:{jsx:"automatic"},
  plugins:[{name:"local-built-inter-font",configureServer(server){
    server.middlewares.use("/test-inter.woff2",(_request,response)=>{
      const directory=fileURLToPath(new URL("../../.next/static/media",import.meta.url));
      const file=readdirSync(directory).find(name=>name.startsWith("83afe278b6a6bb3c")&&name.endsWith(".woff2"));
      if(!file){response.statusCode=404;response.end();return;}
      response.setHeader("Content-Type","font/woff2");response.end(readFileSync(`${directory}/${file}`));
    });
  }}],
  server:{host:"127.0.0.1",port:4173,strictPort:true},
});
