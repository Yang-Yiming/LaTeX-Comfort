import type { ReviewPresentationSetting } from "./presentation";

export interface ReviewPresentationOption {
  value: ReviewPresentationSetting;
  label: string;
  description: string;
  detail: string;
}

export function reviewPresentationOptions(
  supportsEditorInset: boolean,
): ReviewPresentationOption[] {
  return [
    {
      value: "auto",
      label: "Auto (recommended)",
      description: "Choose based on the selection",
      detail:
        "Keep short selections inline and open long reviews beside the editor. Experimental builds prefer the editor card.",
    },
    {
      value: "inline",
      label: "Inline: native decorations",
      description: "Stable decoration + CodeLens review",
      detail:
        "Highlight the diff directly in the source and accept or skip hunks from CodeLens.",
    },
    ...(supportsEditorInset
      ? [
          {
            value: "editorInset" as const,
            label: "Inline: experimental editor card",
            description: "Lattice-style card below the selection",
            detail:
              "Render the full review card inside a Proposed editor inset. Falls back when the API is unavailable.",
          },
        ]
      : []),
    {
      value: "sidePanel",
      label: "Side panel",
      description: "Review beside the editor",
      detail:
        "Show the full review card in a separate editor column. Best for long selections and detailed diffs.",
    },
  ];
}
