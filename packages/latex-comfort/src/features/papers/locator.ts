import { posix } from "node:path";

function withoutComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^\\])%.*$/, "$1"))
    .join("\n");
}

function cleanBibliographyPath(value: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return trimmed.toLowerCase().endsWith(".bib") ? trimmed : `${trimmed}.bib`;
}

export function bibliographyReferences(source: string): string[] {
  const text = withoutComments(source);
  const references: string[] = [];

  for (const match of text.matchAll(/\\bibliography\s*\{([^}]*)\}/g)) {
    references.push(
      ...match[1]!
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }
  for (const match of text.matchAll(/\\addbibresource\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g)) {
    const value = match[1]!.trim();
    if (value) references.push(value);
  }
  return references;
}

export function chooseBibliography(input: {
  configured?: string;
  activeSource?: string;
  activePath?: string;
  discovered: readonly string[];
  remembered?: string;
}): string | undefined {
  const configured = input.configured?.trim();
  if (configured) return posix.normalize(cleanBibliographyPath(configured));

  const activePath = input.activePath?.replace(/\\/g, "/");
  const firstReference = input.activeSource ? bibliographyReferences(input.activeSource)[0] : undefined;
  if (firstReference) {
    const base = activePath ? posix.dirname(activePath) : ".";
    return posix.normalize(posix.join(base, cleanBibliographyPath(firstReference))).replace(/^\.\//, "");
  }

  const discovered = [...input.discovered].map((path) => posix.normalize(path.replace(/\\/g, "/")));
  if (input.remembered) {
    const remembered = posix.normalize(input.remembered.replace(/\\/g, "/"));
    if (discovered.includes(remembered)) return remembered;
  }
  return discovered.length === 1 ? discovered[0] : undefined;
}
