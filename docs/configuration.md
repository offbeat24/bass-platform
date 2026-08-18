# Configuration

Minimal `bass.yaml`:

```yaml
bass:
  version: 0.5.0
  profiles: [common]

project:
  name: my-project

execution:
  depth: adaptive          # adaptive | fast | standard | hardened
  verification: affected  # affected | all
  loop:
    no_progress_limit: 1
  parallel:
    max_agents: 2          # default capacity; actual plan remains single unless Hardened + owned paths

context:
  max_chars: 12000

capabilities:
  specification: builtin  # ouroboros | builtin | off
  simplicity: ponytail    # ponytail | builtin | off
  ui_direction: bass      # bass | off
  ui_canvas: off           # pen | off
  html_report: bass        # bass | off

adapters:
  primary: codex
  compatibility: [claude, cursor]
  runner: host                    # host | prime-agent
  context_provider: bass          # bass | graft
  workspace_executor: host        # host | omc | orca
  collaboration_provider: events  # events | buzz
```

Task frontmatter may override bounded budgets and coordination without breaking older tasks:

```yaml
coordination:
  parent_task: null
  depends_on: [API-001]
  owned_paths: [src/payments]

loop:
  stop_when: [acceptance criteria pass]
  required_evidence: [test-output]
  max_turns: 8
  max_attempts: 2
  max_minutes: 30
  no_progress_limit: 1
```

`owned_paths` must be literal project-relative paths. Absolute paths, traversal, and globs are rejected.

Evaluators may tag affected surfaces:

```yaml
evaluators:
  level1:
    - { name: typecheck, command: npm run typecheck }
  level2:
    - { name: ui-tests, command: npm run test:ui, surfaces: [ui] }
  level3:
    - { name: release-smoke, command: npm run release:smoke, surfaces: [release] }
```

Profiles merge from low to high priority, followed by project, environment, task config, and runtime `--set`. `bass config explain` shows every source. `.bass/local.yaml` is gitignored; secrets must not be committed or added to composed context.

`adapters.primary` and `compatibility` select official host checks, not alternate execution plans. Use `bass doctor --capabilities --host codex|claude` for one host and `--host all` for every configured official host. Cursor remains a repository-instruction shim and is ignored by `all`.

External provider installation is host-local. Codex checks only `.codex/plugins/cache`, Claude checks only `.claude/plugins/cache`, and a provider without a host binding reports `unsupported`. `BASS_CODEX_ACTIVE_CAPABILITIES`, `BASS_CLAUDE_ACTIVE_CAPABILITIES`, and matching `*_AUTHENTICATED_CAPABILITIES` variables may contain comma-separated semantic provider IDs when discovery cannot expose session state. The generic legacy variables apply only to a single-host check; `--host all` requires host-specific confirmation.
