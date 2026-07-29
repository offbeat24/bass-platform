# ADR-0004: Natural-language user interface and agent-operated CLI

## Status

Accepted — 2026-07-29, requested by the project owner.

## Context

BASS was designed as a runtime for human-supervised AI software engineering, but the first CLI
workflow exposed internal task files, ten workflow states, gates, critic artifacts, and run records
as if people should operate them directly. In practice this produced ceremonial approvals and made
users learn BASS mechanics before asking for product or design work.

The Core prompt requires proportional clarification, explicit human ownership of product and risk
decisions, small reviewable work, idempotent recovery, and an execution interface. It does not
require every workflow transition to become a user approval.

## Decision

1. The user's default interface is natural-language conversation with a host AI agent.
2. The BASS CLI is the host agent's internal, versioned execution API and remains available for
   debugging, CI, and expert operations.
3. Workflow states are internal execution and recovery state. Agents advance them without asking
   for ceremonial approval.
4. Human decisions attach to product meaning, value, irreversible risk, and final judgment—not to
   workflow phases.
5. Risk approvals and final approval are explicit, immutable records. Repeating the same command is
   a successful no-op; conflicting rewrites are rejected.
6. `pre-review` checks evidence before a person sees the result. Final approval is recorded after
   review, and `task finalize` performs the final DONE transition.
7. Repository and generated agent shims instruct AI tools to operate BASS internally and never ask
   people to edit task, gate, approval, critic, or run-record files.

## Consequences

- Clone users can open the repository in an AI tool and state their intent in natural language.
- The AI tool distinguishes BASS development from applying BASS to another project and proposes the
  correct setup path.
- Existing low-level commands remain available, but README and shims no longer present them as the
  primary human workflow.
- Host integrations must honor the decision boundary and must never fabricate human approval.
- The deterministic core remains channel-neutral; Codex, Cursor, and Claude continue to execute
  model and tool work through their own host capabilities.
