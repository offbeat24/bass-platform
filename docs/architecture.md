# BASS 0.4 Architecture

## Boundary

BASS는 하나의 TypeScript Core와 얇은 호스트 skills/hooks로 구성된다. Codex·Claude·Cursor·Prime Agent는 실행 주체이고, BASS가 제품 명세·Task Graph·게이트·evidence의 단일 기준이다.

```text
Codex / Claude / Cursor / optional Prime Agent
        │ thin host skills; approved provider calls only
        ▼
@offbeat24/bass@exact-version
        ├─ shape: PRODUCT / TECH / DESIGN / optional spec
        ├─ plan: DAG / owned paths / ExecutionPlan
        ├─ loop: attempts / budgets / stop conditions
        ├─ verify: affected evaluators / critics / evidence
        └─ observe: status / events.jsonl
        ▼
repository contract + human product judgment
```

The plugin launcher reads `bass.yaml` and uses `npm exec --package=@offbeat24/bass@<version>`. The target repository receives no BASS runtime dependency.

## Authoritative state

- `PRODUCT.md`, `TECH.md`, `DESIGN.md`: product intent and accepted direction.
- `specs/`: only large cross-surface features.
- `.bass/tasks/`: scope, dependencies, ownership, acceptance, and loop contract.
- `.bass/records/`: attempt lineage, verification, evidence checksums, scope, context, usage, and pending refinement proposals.
- `.bass/events.jsonl`: sanitized append-only activity, never the source of current task truth.

`bass status` derives current state from task files and Run Records. Events add last activity, current open attempt, and warnings. A malformed final JSONL row is ignored without discarding earlier valid events.

## ExecutionPlan

`buildExecutionPlan` derives a ceiling from task kind, risk, changed surfaces, loop overrides, selected providers, profile, and evaluator metadata. It includes model-independent role guidance, bounded budgets, provider calls, and parallel capacity.

The default is one active worker. Parallel capacity appears only for Hardened tasks with literal owned paths; the graph rejects cycles, missing dependencies, and overlapping independent ownership.

## External providers

BASS records four optional adapter slots: runner, context provider, workspace executor, and collaboration provider. Provider code and prompt suites stay outside BASS. A call requires both an `ExecutionPlan.capabilityCalls` entry and an installed, host-active provider; missing selection never falls back silently.

Prime Agent refinement is represented only as a pending Run Record proposal. The immutable BASS base prompt and shared skills change through normal review and versioning.

## Observation boundary

`bass status --watch` polls once per second using Node built-ins and prints only changed snapshots. There is no 0.4 dashboard, daemon, TUI, transcript store, or remote control plane. Buzz may consume the event contract but does not own workflow state.
