# Third-Party Notices

## Lattice

LaTeX Comfort includes code and presentation adapted from
[Lattice](https://github.com/leo1oel/lattice), licensed under the Apache
License 2.0. The upstream revision used as the reference is
`eb523a879b10f443b6d6479959eae12750bf168c`.

The adapted material is:

- `packages/latex-comfort-ai/src/diff/diff.ts`, from the token-level
  proofreading diff and hunk grouping in `src/agent/proofread-edits.ts`
- `packages/latex-comfort-ai/src/diff/tokenize.ts`, from the tokenizer used by
  that proofreading diff, extended for CJK segmentation
- `packages/latex-comfort-ai/src/diff/apply.ts`, from the proofreading edit
  application logic in `src/agent/proofread-edits.ts`
- `packages/latex-comfort-ai/webview/src/App.tsx`,
  `packages/latex-comfort-ai/webview/src/InlineDiff.tsx` and
  `packages/latex-comfort-ai/webview/src/theme.css`, adapted from Lattice's
  review-card workflow and visual treatment for a VS Code Webview
- `packages/latex-comfort-ai/webview/src/AgentView.tsx` and
  `packages/latex-comfort-ai/webview/src/agent.css`, adapted from Lattice's
  Agent-panel composition, empty state, conversation surface, composer and
  tool/permission presentation for a VS Code Webview
- `packages/latex-comfort/src/features/papers/bibtex.ts`, adapted from
  the BibTeX span parser and value expansion in Lattice's
  `src/papers/bib-document.ts` for read-only bibliography indexing
- `packages/latex-comfort/src/features/papers/model.ts`,
  `citation-key.ts` and `edit.ts`, adapted from Lattice's paper record
  extraction, citation-key generation and bibliography edit helpers in
  `src/papers/bib-document.ts` and `src/papers/bib-entry.ts`
- `packages/latex-comfort/src/features/compile-problems/model.ts`,
  `picker.ts`, `status.ts` and `controller.ts`, adapted from the diagnostic
  grouping, counting and navigation behavior in Lattice's
  `src/build/compile-diagnostics.ts`, `compile-diagnostics-panel.tsx` and
  `build-result-text.ts` for a VS Code status bar and Quick Pick

The adaptation changes Lattice's CodeMirror and React application integration
to VS Code ranges, commands, decorations and Webview theming. LaTeX Comfort
does not include Lattice's editor integration, CodeMirror extensions, GPUI
application, tldraw SDK or Trellis code.

Lattice's applicable NOTICE follows:

```text
Lattice
Copyright 2026 Leonardo and the Lattice contributors

Lattice is licensed under the Apache License, Version 2.0 (see LICENSE).
```

The full Apache License 2.0 text is in the repository root `LICENSE` and in
each extension package's `LICENSE` file. The product-wide notice is in
`NOTICE`; the same file ships with every extension package.

## Lattice licensing boundaries

Lattice's root `src/` and `src-tauri/` code is Apache-2.0. Its `gpui/`
application has separate terms, and its `NOTICE` also identifies tldraw and
Trellis as exceptions. LaTeX Comfort does not copy code from those areas.
