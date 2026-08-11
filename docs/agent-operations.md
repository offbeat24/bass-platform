# Agent operations

## Start

1. Read repository-native instructions.
2. Run `bass agent guide <task-id> --json`.
3. Verify selected external capabilities with `bass doctor --capabilities` only when the plan calls them.
4. Treat `execution_plan` as the maximum work budget.

Create `.bass/tasks/<id>.md` only when a team handoff, risky decision, or multi-turn recovery needs durable state. A small Fast task may keep only scope, acceptance, and verification.

## Work

- `CAPTURED`: confirm facts, accepted scope, exclusions, acceptance, and risk decisions.
- `ACTIVE`: implement the smallest change and run `bass evaluate --task <id>` once.
- `REVIEW`: present result, evidence, limitations, and product judgment once.
- `DONE`: record completion without repeating side effects.

After an evaluator fails, change only the cause and rerun the failed/directly affected checks. Never restart the complete suite unless the plan is Hardened or release and the final full pass is required.

For a delete task, search stale references and run affected tests. Do not create efficiency, onboarding, cleanup, or new-feature tasks beside it.

For material UI, settle direction before code and render desktop/mobile once after the meaningful change. Small UI fixes inherit `DESIGN.md` and do not reload UI direction.

## Human boundaries

Ask the human for product direction, value tradeoffs, destructive/security approval, and final product judgment. Do not ask them to approve internal states, run BASS commands, or edit task/record files. Never convert a missing external plugin to builtin without an explicit configuration change.
