# BASS 0.5 Architecture

## Boundary

BASS는 하나의 TypeScript Core와 하나의 `plugins/bass/` 패키지로 구성된다. Codex와 Claude Code 매니페스트는 같은 skills, hooks, launcher를 사용하는 발견용 어댑터다. Codex 매니페스트는 공용 훅을 명시하고 Claude Code는 표준 `hooks/hooks.json`을 자동 발견한다. BASS가 제품 명세·Task Graph·게이트·evidence의 단일 기준이며, Codex Desktop/CLI와 Claude Code가 공식 호환 호스트다. Cursor shim은 best effort다.

```text
Codex manifest / Claude manifest
        │ same plugins/bass package
        ▼
shared skills / hooks / launcher
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

The plugin launcher resolves from each `SKILL.md`, reads `bass.yaml`, and runs npm's JavaScript entrypoint with `process.execPath`. Setup and upgrade use the plugin version so an older project can migrate. The target repository receives no BASS runtime dependency.

## Authoritative state

- `PRODUCT.md`, `TECH.md`, `DESIGN.md`: product intent and accepted direction.
- `specs/`: only large cross-surface features.
- `.bass/tasks/`: scope, dependencies, ownership, acceptance, and loop contract.
- `.bass/records/`: execution contract, capability invocations, attempt lineage, verification, evidence checksums, scope, context, usage, and pending refinement proposals.
- `.bass/events.jsonl`: sanitized append-only activity and capability call ledger, never the source of current task truth.

`bass status` derives current state from task files and Run Records. Events add last activity, current open attempt, and warnings. A malformed final JSONL row is ignored without discarding earlier valid events.

## ExecutionPlan

`buildExecutionPlan` derives a ceiling from task kind, risk, changed surfaces, loop overrides, selected providers, profile, and evaluator metadata. `contractVersion` identifies the normalized schema and `planFingerprint` is a SHA-256 over the host-neutral plan. Host-local installation, authentication, model, token, duration, and prose do not enter the fingerprint.

The default is one active worker. Parallel capacity appears only for Hardened tasks with literal owned paths; the graph rejects cycles, missing dependencies, and overlapping independent ownership.

## External providers

BASS records four optional adapter slots: runner, context provider, workspace executor, and collaboration provider. One provider catalog maps semantic IDs to Codex/Claude plugin IDs, commands or MCP tools, authentication, restart requirements, and unsupported hosts. Installation caches are inspected separately. Provider code and prompt suites stay outside BASS; missing, inactive, unauthenticated, or unsupported selections never fall back silently.

## Capability call idempotency

External calls use `claim → host invocation → complete`. The call ID hashes `planFingerprint + taskId + attempt + capabilityCall` and deliberately excludes host, so handing the same attempt from Codex to Claude cannot duplicate side effects. A completed call is reused, a started-only call returns `uncertain`, and a conflicting completion fails. A new attempt is the only intentional retry boundary. Event schema v2 carries this ledger while the reader remains compatible with v1.

Prime Agent refinement is represented only as a pending Run Record proposal. The immutable BASS base prompt and shared skills change through normal review and versioning.

## Observation boundary

`bass status --watch` polls once per second using Node built-ins and prints only changed snapshots. There is no 0.5 dashboard, daemon, TUI, transcript store, remote control plane, separate orchestrator, MCP server, or state database. Buzz may consume the event contract but does not own workflow state.
