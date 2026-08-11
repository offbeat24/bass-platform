---
name: bass-game-runtime
description: Recommend, inspect, scaffold, install, or verify game runtimes in BASS game-profile repositories. Use for vanilla web, Pixi, Phaser, PlayCanvas, Unity, or Capacitor work; never run installs or create external projects before explicit user selection.
---

# BASS Game Runtime

1. Run `bass runtime list` and `bass runtime recommend` before choosing an engine.
2. Base recommendations on 2D/3D needs, targets, existing dependencies, team readiness, deployment, and license risk.
3. Run `runtime doctor <id>` before scaffold. Recommendation is advisory; require explicit runtime and destination selection before scaffold or install.
4. Managed files use checksums. Stop on conflict and preserve user edits.
5. Run `runtime install` only with explicit approval. Then run `runtime verify` only for selected targets.
6. The `game` profile is generic. Load `nan2026` only when the user is doing that event; do not introduce contest gates, time limits, evidence, trace, or session locks into ordinary games.
