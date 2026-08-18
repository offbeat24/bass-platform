# Workflows

```text
CAPTURED → ACTIVE → REVIEW → DONE
```

Recovery states are `BLOCKED`, `NEEDS_DECISION`, `NEEDS_EXPERT`, `FAILED`, `ROLLED_BACK`, and `CANCELLED`. Old 0.2 states normalize to the four-stage path.

## Shape and capture

Start with PRODUCT, TECH, and DESIGN. Use `specs/<feature>.md` only for a large cross-surface outcome. A task must state shipping and excluded scope, acceptance, relevant context, allowed/forbidden paths, rollback, dependencies, ownership, stop conditions, and required evidence.

`bass task graph` blocks missing dependencies, cycles, and independent owned-path overlap before work starts.

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

Full logs live under `.bass/evidence/<task-id>/`. Events contain one-line summaries only. Host token metrics are recorded when available and otherwise remain `unknown`.

A repeated claim in the same attempt returns `reuse` after completion or `uncertain` after an incomplete start. Neither path reinvokes the provider. Only a newly started attempt permits an intentional retry.

## Review and done

`pre-review` validates the Run Record, current plan fingerprint, capability events, final passing attempt, evidence checksums, context freshness, actual scope, model deviations, docs, rollback, critics, and material UI evidence. It does not manufacture final human approval.

After the human accepts product meaning and remaining risk, `bass approval final` records the decision and `bass task finalize` transitions REVIEW to DONE. Repeating finalize is a no-op.

Product feedback after REVIEW becomes a new or recaptured task with a newly bounded loop; events from the previous loop remain history rather than prompt context.
