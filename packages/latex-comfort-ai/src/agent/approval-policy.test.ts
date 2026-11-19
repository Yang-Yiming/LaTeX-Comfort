import { describe, expect, it } from "vitest";
import { decidePermission } from "./approval-policy";
import type { AgentPermissionRequest } from "./types";

const options = [
  { id: "once", label: "Allow once", kind: "allow_once" },
  { id: "always", label: "Always allow", kind: "allow_always" },
  { id: "reject", label: "Reject", kind: "reject_once" },
];

function request(
  toolKind: AgentPermissionRequest["toolKind"],
  path = "/work/main.tex",
): AgentPermissionRequest {
  return {
    toolKind,
    title: "Edit main.tex",
    locations: [{ path }],
    diffs: [
      {
        path,
        oldText: "old\n",
        newText: "new\n",
      },
    ],
    options,
  };
}

describe("decidePermission", () => {
  it("allows everything in full access", () => {
    expect(decidePermission(request("edit"), "full-access", "/work")).toEqual({
      type: "allow",
      optionId: "once",
    });
  });

  it("asks before every edit in approval-required", () => {
    expect(decidePermission(request("edit"), "approval-required", "/work")).toEqual({
      type: "ask",
    });
  });

  it("keeps reads quiet in approval-required", () => {
    expect(decidePermission(request("read"), "approval-required", "/work")).toEqual({
      type: "allow",
      optionId: "once",
    });
  });

  it("allows edits inside the workspace in auto", () => {
    expect(decidePermission(request("edit"), "auto", "/work")).toEqual({
      type: "allow",
      optionId: "once",
    });
  });

  it("asks before edits outside the workspace in auto", () => {
    expect(
      decidePermission(request("edit", "/outside/main.tex"), "auto", "/work"),
    ).toEqual({ type: "ask" });
  });

  it("asks before shell, deletes and fetches in auto", () => {
    for (const kind of ["execute", "delete", "fetch", "other"] as const) {
      expect(decidePermission(request(kind), "auto", "/work")).toEqual({
        type: "ask",
      });
    }
  });

  it("falls back to asking when no allow option exists", () => {
    const bare = {
      ...request("read"),
      options: [{ id: "reject", label: "Reject", kind: "reject_once" }],
    };
    expect(decidePermission(bare, "full-access", "/work")).toEqual({ type: "ask" });
  });
});
