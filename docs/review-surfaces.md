# Review surfaces

LaTeX Comfort AI has one review model and two stable presentation adapters:

- **Side panel** (`sidePanel`): full-width review beside the editor.
- **Native inline** (`inline`): source decorations plus CodeLens actions.

The experimental extension adds:

- **Editor Inset** (`editorInset`): the same React card inside a Proposed `editorInsets` Webview.

## Setting

Stable extension:

```json
"latexComfort.ai.review.presentation": "auto"
```

Values: `auto`, `sidePanel`, `inline`.

Experimental extension adds `editorInset`.

`auto` uses the experimental inset when available, falls back to native inline without Proposed API support, and opens the side panel for selections longer than 20 lines or 1,600 characters.

## Stable build

```bash
pnpm build:stable
pnpm package:stable
```

Output: `packages/latex-comfort-ai/latex-comfort-ai-0.1.0.vsix`.

The stable manifest does not declare `enabledApiProposals`, and the Editor Inset adapter is not included in the stable bundle.

## Experimental build

```bash
pnpm package:experimental
```

Output: `packages/latex-comfort-ai-experimental/latex-comfort-ai-experimental-0.1.0.vsix`.

The experimental VSIX uses `latex-comfort-ai-experimental` as a separate extension id and declares:

```json
"enabledApiProposals": ["editorInsets"]
```

It cannot be published to the Visual Studio Marketplace. Enable Proposed APIs for the experimental extension id when starting VS Code, or add it to `argv.json`.

Disable the stable `latex-comfort-ai` extension while using the experimental build because both currently contribute the same command ids.

## Fallback behavior

- Proposed API missing or throws: native inline review.
- No visible editor for native inline review: side panel.
- Editor Inset card too large: the card scrolls inside its fixed inset height.
- Closing an inline review still rejects the active session; switching to the side panel preserves it.
