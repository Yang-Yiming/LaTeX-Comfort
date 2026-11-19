import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
  sourcemap: true,
  logLevel: "info",
});
