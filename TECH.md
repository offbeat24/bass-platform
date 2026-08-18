# BASS technical direction

## Current system

One dependency-light TypeScript CLI owns configuration, task parsing, state transitions, model alias routing, evaluators, evidence gates, game runtime adapters, and setup/upgrade. Codex and Claude plugins remain thin launchers and skills.

## Stack

Node.js 20+, TypeScript, Commander, YAML, Zod, Vitest. BASS 0.5 adds no runtime dependency.

## Architecture

- Product contract: PRODUCT.md, TECH.md, DESIGN.md, optional specs.
- Execution contract: task DAG, owned paths, adaptive ExecutionPlan, contract version, deterministic fingerprint, bounded attempts.
- Verification contract: affected evaluators, critics, checksum evidence, actual scope comparison.
- Observation contract: authoritative task/record snapshot plus sanitized JSONL activity.
- Provider contract: one host-aware catalog, explicit runner/context/workspace/collaboration selections, doctor checks, and claim/complete idempotency.

## Data and API

Repository-local Markdown, YAML, JSON, and schema-versioned JSONL. Run Record version 2 adds `execution_contract` and `capability_invocations` without invalidating old records. Event reader supports v1 and v2. Events never store transcript, prompt text, or secrets.

## Quality and verification

Typecheck, unit/integration tests, package tarball smoke, plugin manifest validation, performance budget, SessionStart <=600 characters, and managed AGENTS block <=2KB.

## Delivery and operations

Local changes prepare 0.5.0. Push, tag, and package publication are separate approved actions.

## Constraints

No web console/TUI, no automatic external provider installation, no external prompt replication, and no new runtime dependency.

## Open decisions

Provider catalog bindings may expand only from verified host support; BASS must continue to fail closed instead of emulating unsupported providers.
