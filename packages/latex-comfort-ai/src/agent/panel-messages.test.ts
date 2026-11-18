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

  it("accepts image and file attachments", () => {
    const attachments = [
      {
        id: "image-1",
        kind: "image" as const,
        name: "figure.png",
        mimeType: "image/png",
        size: 128,
        data: "aGVsbG8=",
      },
      {
        id: "file-1",
        kind: "file" as const,
        name: "main.tex",
        mimeType: "text/plain",
        size: 12,
        text: "\\documentclass{article}",
      },
    ];
    expect(
      parseAgentWebviewMessage({ type: "agentSend", text: "Use these", attachments }),
    ).toEqual({ type: "agentSend", text: "Use these", attachments });
    expect(
      parseAgentWebviewMessage({ type: "agentSend", text: "", attachments: [attachments[0]] }),
    ).toEqual({ type: "agentSend", text: "", attachments: [attachments[0]] });
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
        type: "agentSend",
        text: "bad",
        attachments: [{ id: "x", kind: "image", name: "", mimeType: "image/png", size: 1, data: "x" }],
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewMessage({
        type: "agentResolvePermission",
        permissionId: "",
      }),
    ).toBeNull();
    expect(parseAgentWebviewMessage({ type: "futureAction" })).toBeNull();
  });

  it("accepts a file mention search request", () => {
    expect(
      parseAgentWebviewMessage({
        type: "agentSearchFiles",
        requestId: "request-1",
        query: "intro",
      }),
    ).toEqual({
      type: "agentSearchFiles",
      requestId: "request-1",
      query: "intro",
    });
    expect(
      parseAgentWebviewMessage({
        type: "agentSearchFiles",
        requestId: "",
        query: "intro",
      }),
    ).toBeNull();
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
