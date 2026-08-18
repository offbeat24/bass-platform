---
name: bass-setup
description: Connect BASS to an empty folder or existing repository when the user asks to set up, initialize, adopt, install, or migrate BASS. Preserve repository files, select optional capabilities explicitly, and never add a target package.json just for BASS.
---

# BASS Setup

Resolve `../../scripts/bass-launcher.cjs` from this `SKILL.md` to an absolute path before any BASS CLI step. `<BASS>` below means `node <absolute launcher path>`; never use a host-specific environment variable or a bare CLI binary.

1. Inspect existing `AGENTS.md`, tool instructions, validation commands, project type, and `bass.yaml` before changing anything.
2. For an existing pre-0.5 project, run `<BASS> upgrade --check` and show planned changes or conflicts before `<BASS> upgrade --apply`.
3. Otherwise run one setup command. In automation, use `<BASS> setup <path> --non-interactive` plus explicit repeated `--capability name=provider` and `--adapter name=provider` flags.
4. Never use `--force`. Preserve user text; BASS owns only its marked `AGENTS.md` block.
5. Run `<BASS> doctor --capabilities --host codex` or `--host claude` for the active host. Use `--host all` only for cross-host release readiness. Missing, inactive, unauthenticated, or unsupported providers block invocation; BASS never installs or substitutes them.
6. Confirm `PRODUCT.md`, `TECH.md`, and `DESIGN.md` exist. Existing files are preserved; new files remain evidence-labeled templates until the repository is inspected.
7. Confirm that non-Node targets gained no `package.json`, managed blocks and shims were not duplicated, and report only created, updated, preserved, and conflicting files.
