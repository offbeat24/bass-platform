# BASS 0.3 Architecture

## Boundaries

BASS has one TypeScript core and two thin host adapters. Codex is the reference host; Claude and Cursor do not fork planning, policy, state, runtime, or evaluator logic.

```text
Codex / Claude / Cursor
        │ thin skills, hooks, entrypoint files
        ▼
@offbeat24/bass@exact-version on the user host
        │
        ├─ setup / doctor / upgrade
        ├─ ExecutionPlan / four-state workflow
        ├─ affected evaluator + diff cache
        └─ generic game runtime adapters
        │
        ▼
bass.yaml + <=2KB AGENTS block + minimal .bass records
```

The plugin launcher reads `bass.yaml` and uses `npm exec --package=@offbeat24/bass@<version>`. npm cache and credentials remain on the host; the target repository receives no BASS dependency.

## ExecutionPlan

`buildExecutionPlan` derives a bounded plan from task kind, risk, changed surfaces, selected capabilities, profile, and evaluator metadata. The plan is a ceiling: a host may do less when evidence makes a step unnecessary, but it must not silently add critics, plugins, or loops.

The evaluator selects levels by depth, filters surface-tagged L2/L3 checks, deduplicates commands, and caches passing results under `.bass/cache/evaluations.json`. The cache key includes the command, Git HEAD, and relevant changed-file contents.

## State compatibility

New writes use `CAPTURED`, `ACTIVE`, `REVIEW`, `DONE`. Readers normalize:

- `DISCOVERY`, `SHAPED`, `READY`, `PLANNED` → `CAPTURED`
- `IMPLEMENTING`, `VERIFYING`, `CRITIQUING` → `ACTIVE`
- `HUMAN_REVIEW` → `REVIEW`

Hold, failure, rollback, cancellation, and explicit human risk/final decisions remain available.

## Plugin loading

SessionStart injects only a short entrypoint. Skills are discovered by description and loaded only for setup, work, material UI direction, final HTML reports, or game runtime tasks. The scope hook compares changed files with the active task and stores one warning fingerprint in gitignored cache.

External plugins are never reimplemented. BASS plans their bounded invocation and `doctor --capabilities` separates project selection, installation, authentication, session activation, and restart need.

## Game separation

`src/runtime` owns generic contracts, recommendation, catalog, cross-platform doctor, scaffold/install/verify, and checksum-safe managed files. `profiles/game.yaml` exposes them to ordinary projects. `src/nan` and `profiles/nan2026.yaml` contain only event policy; generic runtime modules must never import the NAN overlay.
