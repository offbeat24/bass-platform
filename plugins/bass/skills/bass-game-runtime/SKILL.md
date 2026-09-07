---
name: bass-game-runtime
description: Select, scaffold, install or verify an explicitly requested game runtime in a BASS game project.
---

# BASS Game Runtime

Resolve `../../scripts/bass-launcher.cjs` from this `SKILL.md` to an absolute path before any BASS CLI step. `<BASS>` below means `node <absolute launcher path>`.

1. Reuse the selected engine and destination. Use `<BASS> runtime list` / `runtime recommend` only when selection is needed, considering dimensions, targets, dependencies, team readiness, deployment, and license risk.
2. Run `<BASS> runtime doctor <id>` before scaffold. A user request naming the runtime, destination, and scaffold/install action supplies that selection and authorization; ask only for missing choices. Recommendations alone do not authorize changes.
3. Managed files use checksums. Stop on conflict and preserve user edits.
4. Run authorized `<BASS> runtime install`, then `<BASS> runtime verify` for selected targets. Do not request the same authorization again.
5. The `game` profile is generic. Load `nan2026` only when the user is doing that event; do not introduce contest gates, time limits, evidence, trace, or session locks into ordinary games.
