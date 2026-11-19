import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";

export const EDIT_ASK_RULE = {
  action: "edit",
  resource: "*",
  effect: "ask",
} as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEditRule(
  value: unknown,
): value is JsonRecord & { effect: "allow" | "ask" | "deny" } {
  return (
    isRecord(value) &&
    value.action === "edit" &&
    (value.effect === "allow" || value.effect === "ask" || value.effect === "deny")
  );
}

/**
 * Places the rule before the first edit denial so explicit denials keep
 * winning under OpenCode's last-match-wins rules. Without a denial the rule
 * goes last, overriding earlier edit allowances.
 */
function insertionIndex(rules: readonly unknown[]): number {
  const firstDeny = rules.findIndex(
    (rule) => isEditRule(rule) && rule.effect === "deny",
  );
  return firstDeny >= 0 ? firstDeny : rules.length;
}

export interface EditAskRuleResult {
  text: string;
  changed: boolean;
}

/** Adds the OpenCode rule that makes every edit ask before writing. */
export function insertEditAskRule(
  text: string,
  formatting = { insertSpaces: true, tabSize: 2 },
): EditAskRuleResult {
  const errors: ParseError[] = [];
  const value: unknown = text.trim()
    ? parse(text, errors, { allowTrailingComma: true })
    : {};
  if (errors.length > 0) {
    throw new Error("The OpenCode configuration could not be parsed.");
  }
  if (!isRecord(value)) {
    throw new Error("The OpenCode configuration must be an object.");
  }
  const permissions = value.permissions;
  if (permissions !== undefined && !Array.isArray(permissions)) {
    throw new Error("OpenCode's `permissions` setting is not an array.");
  }
  const rules = permissions ?? [];
  if (
    rules.some(
      (rule) =>
        isEditRule(rule) &&
        rule.effect === "ask" &&
        rule.resource === "*",
    )
  ) {
    return { text, changed: false };
  }
  const index = insertionIndex(rules);
  const edits =
    permissions === undefined
      ? modify(text.trim() ? text : "{}\n", ["permissions"], [EDIT_ASK_RULE], {
          formattingOptions: formatting,
        })
      : modify(text, ["permissions", index], EDIT_ASK_RULE, {
          formattingOptions: formatting,
          isArrayInsertion: true,
        });
  const result = applyEdits(text.trim() ? text : "{}\n", edits);
  return { text: result.endsWith("\n") ? result : `${result}\n`, changed: true };
}
