# Local reference repositories

This directory is intentionally ignored by Git. It holds upstream sources and
API definitions that are useful while developing LaTeX Comfort, without
vendoring them into the extension packages.

Expected layout:

```text
third_party/
├── lattice/       # UI and inline proofreading reference
├── oleafly/       # AI inline-edit implementation reference
└── vscode-api/    # @types/vscode package used while researching APIs
```

Recreate the references:

```bash
mkdir -p third_party
git clone --depth 1 https://github.com/leo1oel/lattice.git third_party/lattice
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/Oleafly/Oleafly.git third_party/oleafly
git -C third_party/oleafly sparse-checkout set \
  src/components/editor/cm/inline-ai
mkdir -p third_party/vscode-api
cd third_party/vscode-api
npm pack @types/vscode@1.146.0
tar -xzf types-vscode-1.146.0.tgz
```

Reference revisions used during the first AI implementation:

- Lattice: `eb523a879b10f443b6d6479959eae12750bf168c`
- Oleafly: `65782b79c9df73a98ccb87f0e2b30ac05a5de24f`
- VS Code API types: `@types/vscode@1.146.0`

These projects keep their own licenses. Lattice is Apache-2.0 and Oleafly is
AGPL-3.0-or-later. Do not copy code into a distributed extension without
checking the applicable license.
