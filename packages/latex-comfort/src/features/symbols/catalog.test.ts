import { describe, expect, it } from "vitest";
import { LATEX_SYMBOLS, searchLatexSymbols, type LatexSymbol } from "./catalog";

function commands(symbols: readonly LatexSymbol[]): string[] {
  return symbols.map((symbol) => symbol.command);
}

describe("searchLatexSymbols", () => {
  it("returns the complete catalog in stable order for an empty query", () => {
    expect(LATEX_SYMBOLS.length).toBeGreaterThanOrEqual(100);
    expect(searchLatexSymbols("")).toEqual([...LATEX_SYMBOLS]);
  });

  it("matches a command with or without its leading backslash", () => {
    expect(commands(searchLatexSymbols("alpha"))).toContain("\\alpha");
    expect(commands(searchLatexSymbols("\\alpha"))).toContain("\\alpha");
    expect(commands(searchLatexSymbols("\\alpha"))).not.toContain("\\beta");
  });

  it("matches labels and categories", () => {
    expect(commands(searchLatexSymbols("less than or equal"))).toContain("\\leq");
    expect(searchLatexSymbols("greek").map((symbol) => symbol.category)).toContain("Greek");
    expect(searchLatexSymbols("arithmetic").map((symbol) => symbol.category)).toContain("Operators");
  });

  it("matches command, label, category, and keyword text case-insensitively", () => {
    expect(commands(searchLatexSymbols("GaMMa"))).toContain("\\Gamma");
    expect(commands(searchLatexSymbols("LESS THAN OR EQUAL"))).toContain("\\leq");
    expect(commands(searchLatexSymbols("gReEk"))).toContain("\\alpha");
    expect(commands(searchLatexSymbols("GRADIENT"))).toContain("\\nabla");
  });

  it("does not contain duplicate commands", () => {
    const catalogCommands = commands(LATEX_SYMBOLS);
    expect(new Set(catalogCommands).size).toBe(catalogCommands.length);
  });

  it("contains the approved common palette across the supported categories", () => {
    const catalogCommands = commands(LATEX_SYMBOLS);
    const requiredCommands = [
      "alpha",
      "beta",
      "Gamma",
      "sum",
      "prod",
      "int",
      "leq",
      "geq",
      "neq",
      "approx",
      "to",
      "rightarrow",
      "Rightarrow",
      "infty",
      "partial",
      "nabla",
      "frac",
      "sqrt",
      "binom",
      "left",
      "right",
      "ldots",
      "cdots",
      "mathbb",
      "mathcal",
      "mathbf",
      "mathrm",
    ];
    const categories = new Set(LATEX_SYMBOLS.map((symbol) => symbol.category));

    for (const command of requiredCommands) expect(catalogCommands).toContain(`\\${command}`);
    for (const category of ["Greek", "Operators", "Relations", "Arrows", "Delimiters", "Accents", "Structures", "Miscellaneous"]) {
      expect(categories).toContain(category);
    }
  });
});
