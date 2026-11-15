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
  if (value.type === "reject") {
    return { type: "reject" };
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
  if (
    value.type === "accept" &&
    Array.isArray(value.acceptedIds) &&
    value.acceptedIds.every(isHunkId)
  ) {
    return { type: "accept", acceptedIds: [...new Set(value.acceptedIds)] };
  }
  return null;
}
