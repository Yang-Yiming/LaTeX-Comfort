import { describe, expect, it } from "vitest";
import { agentDefinitions, getAgentDefinition } from "./definitions";

const DEFAULTS = {
  opencodePath: "opencode",
  codexAcpPath: "codex-acp",
  codexPath: "codex",
};

describe("agentDefinitions", () => {
  it("runs OpenCode 2 through its ACP command", () => {
    expect(getAgentDefinition("opencode", DEFAULTS)).toEqual({
      id: "opencode",
      label: "OpenCode",
      command: "opencode",
      args: ["acp"],
      env: undefined,
      missingCommandMessage: expect.stringContaining("opencode"),
    });
  });

  it("runs Codex through codex-acp and reuses the installed Codex CLI", () => {
    expect(getAgentDefinition("codex", DEFAULTS)).toEqual({
      id: "codex",
      label: "Codex",
      command: "codex-acp",
      args: [],
      env: { CODEX_PATH: "codex" },
      missingCommandMessage: expect.stringContaining("codex-acp"),
    });
  });

  it("uses trimmed custom executable paths", () => {
    const definitions = agentDefinitions({
      opencodePath: "  /opt/opencode  ",
      codexAcpPath: "  /opt/codex-acp  ",
      codexPath: "  /opt/codex  ",
    });

    expect(definitions.map((definition) => definition.command)).toEqual([
      "/opt/opencode",
      "/opt/codex-acp",
    ]);
    expect(definitions[1]?.env).toEqual({ CODEX_PATH: "/opt/codex" });
  });

  it("falls back to the default when a configured path is blank", () => {
    const definitions = agentDefinitions({
      opencodePath: " ",
      codexAcpPath: "\t",
      codexPath: "\n",
    });

    expect(definitions[0]?.command).toBe("opencode");
    expect(definitions[1]?.command).toBe("codex-acp");
    expect(definitions[1]?.env).toEqual({ CODEX_PATH: "codex" });
  });
});
