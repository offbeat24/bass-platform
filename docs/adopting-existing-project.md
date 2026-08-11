# Adopting an existing repository

## Inspect first

Record the repository's language, build system, existing agent instructions, CI commands, design source, generated files, and current handoff records. Reuse those facts; BASS must not become a second source of truth.

## Connect

```bash
bass setup /path/to/repo --non-interactive \
  --capability specification=builtin \
  --capability simplicity=ponytail
```

`setup` preserves existing files. It appends or refreshes only the marked block in `AGENTS.md`, creates Claude/Cursor shims only for selected adapters, and ignores `.bass/cache/` and `.bass/local.yaml`. A malformed marker is a conflict and stops integration without `--force`.

For Python, Unity, Rust, or another non-Node repository, assert that no root `package.json` was created. Node 20 and npm belong to the person running BASS, not the target.

## Verify adoption

Run:

```bash
bass doctor
bass doctor --capabilities
bass agent guide --json
```

Then execute one real, small user task. Adoption is complete when the plan selects proportionate checks, existing validation still works, user instructions are intact, and another teammate can continue from the minimal `.bass` evidence.

## Upgrade 0.2

Use `bass upgrade --check` first. Only `--apply` changes files. Root `tasks/` and `records/` remain readable; new records go under `.bass/`. Do not rewrite old completion history merely to match the new four-state vocabulary.
