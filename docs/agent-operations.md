# Agent operations

## Start

1. Read repository-native instructions.
2. Run `bass agent guide <task-id> --json` and `bass task graph`.
3. Verify only named external calls with `bass doctor --capabilities` and current host capability discovery.
4. Treat the ExecutionPlan as a ceiling and start one recorded attempt.

## Work and verify

- Implement the smallest accepted change inside Allowed scope and owned paths.
- Run the cheapest machine check first, then affected higher-level checks and planned critics.
- Reuse unchanged passing evidence. After failure, rerun only failed/directly affected checks.
- Save full output in `.bass/evidence/<task-id>/`; prompts and events receive summaries only.
- Finish the attempt with result, summary, failure fingerprint when relevant, and host-reported turns.
- Stop immediately when BASS moves the task to NEEDS_DECISION or NEEDS_EXPERT.

For material UI, settle direction before code and render actual target viewports after the meaningful change. Record screenshots and console error count. Small UI fixes inherit DESIGN.md.

External runners and workspace executors do not receive broader authority. Prime Agent, OMC, and Orca must follow the BASS graph and loop. Graft only supplies selected context; Buzz only consumes sanitized events.

## Review

Prepare a version 1 Run Record with files, scope comparison, attempts, evidence checksums, context checksums, verification, critics, models, usage, docs, limitations, rollback, and any pending refinement proposal. Run `bass gate pre-review`, transition to REVIEW, and present the result once.

Humans decide product direction, value tradeoffs, destructive/security approval, and final product judgment. They do not need to operate BASS commands or edit records.
