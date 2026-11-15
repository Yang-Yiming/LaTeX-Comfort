import { describe, expect, it } from "vitest";
import { buildEditPrompt, cleanModelReply } from "./prompt";

describe("buildEditPrompt", () => {
  it("asks for a complete replacement with no diff or commentary", () => {
    const prompt = buildEditPrompt({
      mode: "proofread",
      instruction: "Fix grammar only.",
      text: "This are wrong.",
      path: "paper.tex",
      languageId: "latex",
    });

    expect(prompt.system).toContain("complete replacement");
    expect(prompt.system).toContain("not a diff");
    expect(prompt.user).toContain("paper.tex");
    expect(prompt.user).toContain("This are wrong.");
    expect(prompt.user).toContain("Fix grammar only.");
  });

  it("includes bounded surrounding context for LaTeX", () => {
    const prompt = buildEditPrompt({
      mode: "polish",
      instruction: "Make it clearer.",
      text: "selected",
      path: "paper.tex",
      languageId: "latex",
      contextBefore: "before",
      contextAfter: "after",
    });

    expect(prompt.user).toContain("before");
    expect(prompt.user).toContain("after");
    expect(prompt.user).toContain("Selected text");
  });
});

describe("cleanModelReply", () => {
  it("strips fenced code and reasoning blocks", () => {
    expect(
      cleanModelReply("```latex\n\\textbf{Hello}\n```"),
    ).toBe("\\textbf{Hello}");
    expect(cleanModelReply("<think>hidden</think>A better sentence.")).toBe(
      "A better sentence.",
    );
  });

  it("keeps unfenced replacement text", () => {
    expect(cleanModelReply("  Better sentence.  ")).toBe("Better sentence.");
  });
});
