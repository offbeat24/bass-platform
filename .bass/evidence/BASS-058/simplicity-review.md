# BASS-058 simplicity review

- Reuses the existing `task.started` event shape and event log; no schema version, ledger, dependency, or global setting was added.
- Resume is narrow: exact loop-timeout block, NEEDS_DECISION state, no open attempt, remaining attempt allowance, and explicit approver/reason.
- Only the wall-clock anchor moves. Attempts, turns, no-progress, repeated failures, evidence, review, and final approval stay cumulative.
- An expired open attempt is reported and must be explicitly closed before resume, preserving its outcome and duration.
- The local CLI records the supplied approver; it does not authenticate the person. This matches BASS's existing approval command boundary and requires the agent to use the flag only after a direct human decision.
- No additional abstraction or dependency is needed for the single resume marker.

Result: no material simplicity or scope concern found.
