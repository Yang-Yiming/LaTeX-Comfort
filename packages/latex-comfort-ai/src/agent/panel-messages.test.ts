import { describe, expect, it } from "vitest";
import { parseAgentWebviewMessage } from "./panel-messages";

describe("parseAgentWebviewMessage", () => {
  it("accepts a prompt and keeps its text", () => {
    expect(
      parseAgentWebviewMessage({
        type: "agentSend",
        text: "  Fix the build  ",
      }),
    ).toEqual({ type: "agentSend", text: "  Fix the build  " });
  });

  it("accepts a permission decision", () => {
    expect(
      parseAgentWebviewMessage({
        type: "agentResolvePermission",
        permissionId: "permission-1",
        optionId: "allow",
      }),
    ).toEqual({
      type: "agentResolvePermission",
      permissionId: "permission-1",
      optionId: "allow",
    });
  });

  it("rejects malformed or unknown messages", () => {
    expect(parseAgentWebviewMessage(null)).toBeNull();
    expect(parseAgentWebviewMessage({ type: "agentSend", text: 3 })).toBeNull();
    expect(parseAgentWebviewMessage({ type: "agentSend", text: "" })).toBeNull();
    expect(
      parseAgentWebviewMessage({
        type: "agentResolvePermission",
        permissionId: "",
      }),
    ).toBeNull();
    expect(parseAgentWebviewMessage({ type: "futureAction" })).toBeNull();
  });

  it("validates file locations and config actions", () => {
    expect(
      parseAgentWebviewMessage({
        type: "agentOpenLocation",
        path: "chapters/intro.tex",
        line: 12,
      }),
    ).toEqual({
      type: "agentOpenLocation",
      path: "chapters/intro.tex",
      line: 12,
    });
    expect(
      parseAgentWebviewMessage({
        type: "agentSelectConfig",
        configId: "model",
        value: "provider/model",
      }),
    ).toEqual({
      type: "agentSelectConfig",
      configId: "model",
      value: "provider/model",
    });
    expect(
      parseAgentWebviewMessage({
        type: "agentSelectConfig",
        configId: "",
        value: "provider/model",
      }),
    ).toBeNull();
  });
});
