# Workflows

```text
CAPTURED → ACTIVE → REVIEW → DONE
```

Recovery states are `BLOCKED`, `NEEDS_DECISION`, `NEEDS_EXPERT`, `FAILED`, `ROLLED_BACK`, and `CANCELLED`. Old 0.2 states normalize to the four-stage path.

## Shape and capture

Start with PRODUCT, TECH, and DESIGN. Use `specs/<feature>.md` only for a large cross-surface outcome. Every task needs a clear problem, shipping outcome, acceptance criteria, and verification. When BASS computes an eligible Fast plan (low risk, at most two changed surfaces, no policy approval; not delete/release), those four sections are enough. Implementation tasks also name literal `Allowed scope` paths before starting. Standard/Hardened plans, delete/release tasks, and tasks needing a policy approval retain the full capture contract: excluded scope, relevant context, and a task-level rollback plan. Read-only exploration can omit path scope; if it changes project files, add allowed paths before review.

Add forbidden paths, dependencies, owned paths, custom stop conditions, and task-specific evidence only when they constrain the work; the execution plan supplies general loop limits and stop conditions. A Fast task may omit its task-level rollback narrative, but its completion record still states the recovery method or that no special rollback was needed.

`bass task graph` blocks missing dependencies, cycles, and independent owned-path overlap before work starts.

REVIEW (including legacy HUMAN_REVIEW) releases owned paths for independent work. An explicit `depends_on` still requires the predecessor to be DONE. Returning a review task to ACTIVE checks its paths and the active-task limit again before changing state.

The CLI enforces `pre-task` on ACTIVE transitions and attempt starts, even if a separate gate command was skipped or failed. A rejected check changes neither task state nor events. Read-only questions do not start implementation or finalization.

## Active bounded loop

```text
attempt start
→ claim planned external capability
→ invoke once and complete the claim
→ smallest implementation
→ cheapest affected machine checks
→ relevant critic only when planned
→ attempt finish
→ stop, retry failed/affected work, or hold for decision/expert
```

Fast/Standard/Hardened default to 4/8/12 turns, 1/2/3 attempts, and 15/30/60 minutes. A passed attempt does not waive acceptance or evidence gates. Repeated identical failure without new evidence, consecutive no progress, or any exhausted budget stops additional execution.

### Resume after a loop time limit

Only a task whose latest block reason is exactly `loop time budget exhausted` can receive a fresh time window. After any open attempt has been explicitly closed, a human must approve the continuation:

```sh
bass task resume BASS-056 --approved-by user --reason "Continue the approved evaluation"
```

The command appends a `task.started` event named `loop-budget-resume`; it never edits earlier timestamps or outcomes. The next attempt's time window starts at that approval event. Attempt count, cumulative turns, no-progress and repeated-failure limits, evidence requirements, review, and final human approval remain unchanged. Other block reasons cannot be resumed this way.

If an attempt is still open past its time limit, `task attempt start` reports the expiry instead of reusing it. Close that attempt with an explicit no-progress result first; the normal finish gate records the timeout, after which the human-approved resume command can be used.

Full logs live under `.bass/evidence/<task-id>/`. Events contain one-line summaries only. Host token metrics are recorded when available and otherwise remain `unknown`.

A repeated claim in the same attempt returns `reuse` after completion or `uncertain` after an incomplete start. Neither path reinvokes the provider. Only a newly started attempt permits an intentional retry.

### Observe a local run

Run `bass observe` from the project to open a read-only live page with task state, attempt/turn/time budget, evaluations, evidence, blockers, and a chronological BASS plus agent-tool timeline. Select a task card to enter its numbered, task-specific process history; use “전체 작업” to return. Local Codex and Claude Code activity for the active task appears alongside its BASS stages. The server binds to `127.0.0.1`; if automatic browser launch is unavailable, open the printed URL. Use `--no-open` to print the URL without launching a browser and Ctrl-C to stop the observer. Local tool events include only bounded, redacted previews held in memory; conversations and model reasoning are not collected. Codex `PostToolUse` also runs after a Bash command exits nonzero; Claude Code reports execution failures through `PostToolUseFailure` (permission denials are a separate case). Codex hosted tools are not visible to local hooks.

## Review and done

`pre-review` validates the Run Record, current plan fingerprint, capability events, final passing attempt, evidence checksums, context freshness, actual scope, model deviations, docs, rollback, critics, and material UI evidence. It does not manufacture final human approval.

After the human accepts product meaning and remaining risk, `bass approval final` records the decision and `bass task finalize` transitions REVIEW to DONE. Repeating finalize is a no-op.

Product feedback after REVIEW becomes a new or recaptured task with a newly bounded loop; events from the previous loop remain history rather than prompt context.
