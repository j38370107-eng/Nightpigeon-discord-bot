import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

globalThis.require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));

await rm(path.join(dir, "dist/server"), { recursive: true, force: true });

await build({
  entryPoints: [path.join(dir, "server/index.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: path.join(dir, "dist/server"),
  outExtension: { ".js": ".mjs" },
  external: [
    "*.node", "pg-native", "bufferutil", "utf-8-validate",
    "fsevents", "lightningcss",
  ],
  sourcemap: "linked",
  banner: {
    js: `import { createRequire as __crReq } from 'node:module';
import __bPath from 'node:path';
import __bUrl from 'node:url';
globalThis.require = __crReq(import.meta.url);
globalThis.__filename = __bUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bPath.dirname(globalThis.__filename);
`,
  },
});

console.log("Server build complete");
