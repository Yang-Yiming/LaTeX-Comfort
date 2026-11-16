import type { HostToWebviewMessage } from "@latex-comfort/shared";
import type { ReviewViewState } from "./state";

export function reviewStateToMessage(
  state: ReviewViewState,
  canOpenSidebar: boolean,
): HostToWebviewMessage | undefined {
  if (state.status === "idle") return undefined;
  if (state.status === "loading") {
    return {
      type: "loading",
      mode: state.mode,
      ...(state.instruction ? { instruction: state.instruction } : {}),
    };
  }
  if (state.status === "error") {
    return {
      type: "error",
      message: state.message,
      canConfigure: state.canConfigure,
    };
  }
  return {
    type: "ready",
    state: state.review,
    selectedHunkIds: [...state.selectedHunkIds],
    canOpenSidebar,
  };
}
