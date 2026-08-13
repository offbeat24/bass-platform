# BASS technical direction

## Current system

One dependency-light TypeScript CLI owns configuration, task parsing, state transitions, model alias routing, evaluators, evidence gates, game runtime adapters, and setup/upgrade. Codex and Claude plugins remain thin launchers and skills.

## Stack

Node.js 20+, TypeScript, Commander, YAML, Zod, Vitest. BASS 0.4 adds no runtime dependency.

## Architecture

- Product contract: PRODUCT.md, TECH.md, DESIGN.md, optional specs.
- Execution contract: task DAG, owned paths, adaptive ExecutionPlan, bounded attempts.
- Verification contract: affected evaluators, critics, checksum evidence, actual scope comparison.
- Observation contract: authoritative task/record snapshot plus sanitized JSONL activity.
- Provider contract: explicit runner/context/workspace/collaboration selections with doctor checks.

## Data and API

Repository-local Markdown, YAML, JSON, and schema-versioned JSONL. Run Record version 1 extends but does not invalidate 0.3 records. Events never store transcript, prompt text, or secrets.

## Quality and verification

Typecheck, unit/integration tests, package tarball smoke, plugin manifest validation, performance budget, SessionStart <=600 characters, and managed AGENTS block <=2KB.

## Delivery and operations

Three local commits prepare 0.4.0. Push, tag, and package publication are separate approved actions.

## Constraints

No web console/TUI, no automatic external provider installation, no external prompt replication, and no new runtime dependency.

## Open decisions

Provider activation detection may later gain host-specific adapters if real team usage shows that warning-only discovery is insufficient.
