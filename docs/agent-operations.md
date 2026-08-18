# Agent operations

## Start

1. Read repository-native instructions.
2. Run `bass agent guide <task-id> --json`, preserve its `contractVersion` and `planFingerprint`, and inspect `bass task graph`.
3. Verify only named external calls with `bass doctor --capabilities --host codex|claude` and current host capability discovery.
4. Treat the ExecutionPlan as a ceiling, transition to ACTIVE, and start one recorded attempt.

## Work and verify

- Implement the smallest accepted change inside Allowed scope and owned paths.
- Run the cheapest machine check first, then affected higher-level checks and planned critics.
- Reuse unchanged passing evidence. After failure, rerun only failed/directly affected checks.
- Save full output in `.bass/evidence/<task-id>/`; prompts and events receive summaries only.
- Finish the attempt with result, summary, failure fingerprint when relevant, and host-reported turns.
- Stop immediately when BASS moves the task to NEEDS_DECISION or NEEDS_EXPERT.

For each external `capabilityCall`, claim it before invoking the host plugin:

```bash
bass capability claim TASK-001 ponytail:full --host codex --json
bass capability complete TASK-001 ponytail:full --host codex \
  --status pass --summary "simplicity review accepted"
```

Invoke only when claim returns `run`. `reuse` means consume the existing completion. `uncertain` means an earlier invocation may have caused side effects, so stop without retrying. A new attempt creates a new call ID.

For material UI, settle direction before code and render actual target viewports after the meaningful change. Record screenshots and console error count. Small UI fixes inherit DESIGN.md.

External runners and workspace executors do not receive broader authority. Prime Agent, OMC, and Orca must follow the BASS graph and loop. Graft only supplies selected context; Buzz only consumes sanitized events.

## Review

Prepare a version 2 Run Record with `execution_contract`, `capability_invocations`, files, scope comparison, attempts, evidence checksums, context checksums, verification, critics, models, usage, docs, limitations, rollback, and any pending refinement proposal. The contract fields must exactly mirror the current plan and each invocation must match a completed event. Run `bass gate pre-review`, transition to REVIEW, and present the result once.

Humans decide product direction, value tradeoffs, destructive/security approval, and final product judgment. They do not need to operate BASS commands or edit records.
