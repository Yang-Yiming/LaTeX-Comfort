import type { WebviewToHostMessage } from "@latex-comfort/shared";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isHunkId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export function parseWebviewMessage(
  value: unknown,
): WebviewToHostMessage | null {
  if (!isRecord(value)) return null;

  if (value.type === "webviewReady") {
    return { type: "webviewReady" };
  }
  if (value.type === "accept") {
    return { type: "accept" };
  }
  if (value.type === "reject") {
    return { type: "reject" };
  }
  if (value.type === "openSidebar") {
    return { type: "openSidebar" };
  }
  if (
    value.type === "contentHeight" &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0
  ) {
    return {
      type: "contentHeight",
      height: value.height,
      ...(typeof value.fontSize === "number" &&
      Number.isFinite(value.fontSize) &&
      value.fontSize > 0
        ? { fontSize: value.fontSize }
        : {}),
    };
  }
  if (value.type === "configureProvider") {
    return { type: "configureProvider" };
  }
  if (
    value.type === "toggleHunk" &&
    isHunkId(value.id) &&
    typeof value.accepted === "boolean"
  ) {
    return { type: "toggleHunk", id: value.id, accepted: value.accepted };
  }
  return null;
}
