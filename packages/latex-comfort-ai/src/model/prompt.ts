import type { EditMode } from "@latex-comfort/shared";

export interface EditPromptRequest {
  mode: EditMode;
  instruction: string;
  text: string;
  path: string;
  languageId: string;
  contextBefore?: string;
  contextAfter?: string;
}

const MODE_RULES: Record<EditMode, string> = {
  proofread:
    "Correct grammar, spelling, punctuation and unmistakable errors. Make the smallest changes necessary. Do not polish or rewrite already-correct prose.",
  polish:
    "Improve clarity, flow and academic style while preserving meaning. Prefer local rewording over rewriting whole sentences.",
  rewrite:
    "Follow the user's instruction while preserving anything they did not ask to change.",
};

const SYSTEM = [
  "You edit a selected passage inside the user's editor.",
  "Return only the complete replacement for the selected text, not a diff.",
  "Do not include explanation, commentary or a Markdown code fence.",
  "Preserve LaTeX commands, citation keys, labels and math unless the instruction explicitly asks to change them.",
].join(" ");

export function buildEditPrompt(request: EditPromptRequest): {
  system: string;
  user: string;
} {
  const context = [
    request.contextBefore
      ? `Context before (reference only):\n${request.contextBefore}`
      : "",
    request.contextAfter
      ? `Context after (reference only):\n${request.contextAfter}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const user = [
    `File: ${request.path}`,
    `Language: ${request.languageId}`,
    `Task: ${MODE_RULES[request.mode]}`,
    context,
    `Selected text to replace:\n${request.text}`,
    `Instruction: ${request.instruction.trim() || "Apply the task above."}`,
    "Return the replacement text only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: `${SYSTEM} ${MODE_RULES[request.mode]}`, user };
}

/** Removes reasoning blocks and an optional wrapper fence from a model reply. */
export function cleanModelReply(reply: string): string {
  let text = reply
    .replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(think|thinking)>[\s\S]*$/i, "")
    .trim();

  const fenced = /^```[^\n]*\n?([\s\S]*?)\n?```$/.exec(text);
  if (fenced) text = fenced[1] ?? "";
  else if (/^```[^\n]*\n/.test(text)) text = text.replace(/^```[^\n]*\n/, "");

  return text.trim();
}
