import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  "latex-comfort",
  "latex-comfort-ai",
  "latex-comfort-ai-experimental",
  "latex-comfort-bundle",
];
const adaptedFiles = [
  "packages/latex-comfort-ai/src/diff/apply.ts",
  "packages/latex-comfort-ai/src/diff/diff.ts",
  "packages/latex-comfort-ai/src/diff/tokenize.ts",
  "packages/latex-comfort-ai/webview/src/App.tsx",
  "packages/latex-comfort-ai/webview/src/InlineDiff.tsx",
  "packages/latex-comfort-ai/webview/src/theme.css",
  "packages/latex-comfort-ai/webview/src/AgentView.tsx",
  "packages/latex-comfort-ai/webview/src/agent.css",
  "packages/latex-comfort/src/features/papers/bibtex.ts",
  "packages/latex-comfort/src/features/papers/model.ts",
  "packages/latex-comfort/src/features/papers/citation-key.ts",
  "packages/latex-comfort/src/features/papers/edit.ts",
  "packages/latex-comfort/src/features/compile-problems/model.ts",
  "packages/latex-comfort/src/features/compile-problems/picker.ts",
  "packages/latex-comfort/src/features/compile-problems/status.ts",
  "packages/latex-comfort/src/features/compile-problems/controller.ts",
];

const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");

const notice = read("NOTICE").trim();
if (!notice.includes("Copyright 2026 Leonardo and the Lattice contributors")) {
  failures.push("NOTICE must retain Lattice's copyright attribution");
}
if (!notice.includes("Apache License, Version 2.0")) {
  failures.push("NOTICE must name the Apache License, Version 2.0");
}
if (!notice.includes("eb523a879b10f443b6d6479959eae12750bf168c")) {
  failures.push("NOTICE must record the upstream Lattice revision");
}

for (const pkg of packages) {
  const path = `packages/${pkg}/NOTICE`;
  if (!existsSync(join(root, path))) {
    failures.push(`${path} is missing`);
    continue;
  }
  if (read(path).trim() !== notice) {
    failures.push(`${path} differs from the root NOTICE`);
  }

  const license = `packages/${pkg}/LICENSE`;
  if (!existsSync(join(root, license))) {
    failures.push(`${license} is missing`);
  } else if (!read(license).includes("Apache License")) {
    failures.push(`${license} does not contain the Apache License text`);
  }
}

for (const path of adaptedFiles) {
  if (!existsSync(join(root, path))) {
    failures.push(`${path} is missing`);
    continue;
  }
  const text = read(path);
  if (!text.includes("Lattice") || !text.includes("Apache License, Version 2.0")) {
    failures.push(`${path} lacks its Lattice adaptation notice`);
  }
}

if (failures.length > 0) {
  console.error("Notice check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Notice check passed: NOTICE, ${packages.length} package copies and ${adaptedFiles.length} adapted files.`);
