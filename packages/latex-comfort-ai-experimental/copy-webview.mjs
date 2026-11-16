import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(here, "dist"), { recursive: true });
await rm(path.join(here, "dist", "webview"), { recursive: true, force: true });
await cp(
  path.join(here, "..", "latex-comfort-ai", "dist", "webview"),
  path.join(here, "dist", "webview"),
  { recursive: true },
);
