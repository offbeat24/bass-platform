---
name: bass-setup
description: Connect BASS to an empty folder or existing repository when the user asks to set up, initialize, adopt, install, or migrate BASS. Preserve repository files, select optional capabilities explicitly, and never add a target package.json just for BASS.
---

# BASS Setup

1. Inspect existing `AGENTS.md`, tool instructions, validation commands, project type, and `bass.yaml` before changing anything.
2. For 0.2, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/bass-launcher.cjs" upgrade --check` and show conflicts before `--apply`.
3. Otherwise run one setup command. In automation, use `setup <path> --non-interactive` plus explicit repeated `--capability name=provider` flags.
4. Never use `--force`. Preserve user text; BASS owns only its marked `AGENTS.md` block.
5. Run `doctor` and `doctor --capabilities`. A selected missing plugin is a blocker, not permission to substitute the builtin provider.
6. Confirm `PRODUCT.md`, `TECH.md`, and `DESIGN.md` exist. Existing files are preserved; new files remain evidence-labeled templates until the repository is inspected.
7. Confirm that non-Node targets gained no `package.json` and report only created, updated, preserved, and conflicting files.
