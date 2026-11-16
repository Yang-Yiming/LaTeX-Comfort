import { build } from "esbuild";

await build({
  entryPoints: ["../latex-comfort-ai/src/experimental/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
});
