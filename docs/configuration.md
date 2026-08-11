# Configuration

Minimal `bass.yaml`:

```yaml
bass:
  version: 0.3.0
  profiles: [common]

project:
  name: my-project

execution:
  depth: adaptive       # adaptive | fast | standard | hardened
  verification: affected # affected | all

capabilities:
  specification: builtin # ouroboros | builtin | off
  simplicity: ponytail   # ponytail | builtin | off
  ui_direction: bass     # bass | off
  ui_canvas: off         # pen | off
  html_report: bass      # bass | off

adapters:
  primary: codex
  compatibility: [claude, cursor]
```

Evaluators may tag affected surfaces:

```yaml
evaluators:
  level1:
    - name: typecheck
      command: npm run typecheck
  level2:
    - name: ui-tests
      command: npm run test:ui
      surfaces: [ui]
    - name: migrations
      command: npm run test:migrations
      surfaces: [data]
  level3:
    - name: release-smoke
      command: npm run release:smoke
      surfaces: [release]
```

Profiles merge from low to high priority. `game` extends `common`; `nan2026` extends `game`. Project values override profiles, followed by environment, task config, and runtime `--set` values.

`bass config explain` displays the final value and source. `.bass/local.yaml` is reserved for unshared host-local values and is gitignored; secrets must not be committed to `bass.yaml`.
