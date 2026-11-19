import { describe, expect, it } from "vitest";
import { insertEditAskRule } from "./opencode-config";

describe("insertEditAskRule", () => {
  it("creates a permissions array when none exists", () => {
    const result = insertEditAskRule('{\n  "model": "x"\n}\n');
    expect(result.changed).toBe(true);
    expect(result.text).toContain('"permissions"');
    expect(result.text).toContain('"action": "edit"');
    expect(result.text).toContain('"effect": "ask"');
  });

  it("handles an empty configuration", () => {
    const result = insertEditAskRule("");
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.text).permissions).toEqual([
      { action: "edit", resource: "*", effect: "ask" },
    ]);
  });

  it("places ask after edit allows and before edit denies", () => {
    const input = JSON.stringify(
      {
        permissions: [
          { action: "edit", resource: "*", effect: "allow" },
          { action: "edit", resource: "*.env", effect: "deny" },
        ],
      },
      null,
      2,
    );
    const result = insertEditAskRule(input);
    const value = JSON.parse(result.text);
    expect(value.permissions.map((rule: { effect: string }) => rule.effect)).toEqual([
      "allow",
      "ask",
      "deny",
    ]);
  });

  it("puts ask before a denial even when an allow follows it", () => {
    const input = JSON.stringify(
      {
        permissions: [
          { action: "edit", resource: "*.env", effect: "deny" },
          { action: "edit", resource: "*", effect: "allow" },
        ],
      },
      null,
      2,
    );
    const result = insertEditAskRule(input);
    const value = JSON.parse(result.text);
    expect(value.permissions.map((rule: { effect: string }) => rule.effect)).toEqual([
      "ask",
      "deny",
      "allow",
    ]);
  });

  it("leaves an existing ask rule alone", () => {
    const input =
      '{\n  "permissions": [\n    { "action": "edit", "resource": "*", "effect": "ask" }\n  ]\n}\n';
    expect(insertEditAskRule(input)).toEqual({ text: input, changed: false });
  });

  it("keeps comments and trailing commas in JSONC", () => {
    const input = [
      "{",
      "  // project settings",
      '  "permissions": [',
      '    { "action": "edit", "resource": "*", "effect": "allow" }, // allow edits',
      "  ],",
      "}",
      "",
    ].join("\n");
    const result = insertEditAskRule(input);
    expect(result.text).toContain("// project settings");
    expect(result.text).toContain("// allow edits");
    expect(result.text).toContain('"effect": "ask"');
  });
});
