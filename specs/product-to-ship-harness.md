---
title: BASS 0.4 Product-to-Ship Harness
status: implemented
owner: user
---

# BASS 0.4 Product-to-Ship Harness

## Outcome

Extend BASS from a portable adaptive task runtime into an idea-to-review harness without turning it into a monolithic agent or dashboard.

## Requirements

- Create and preserve PRODUCT, TECH, and DESIGN; use feature specs selectively.
- Validate task dependencies, cycles, and path ownership.
- Bound attempts by turns, attempts, elapsed time, no progress, and repeated failure.
- Record checksum-backed evidence, context, scope, model deviations, and optional usage.
- Compose only explicit and directly relevant context under a 12,000-character budget.
- Represent external harnesses as optional verified providers.
- Expose sanitized events and read-only status/watch without a new runtime dependency.
- Preserve 0.3 task, config, and Run Record compatibility.

## Non-goals

Web console, TUI, provider installation, external prompt/runtime duplication, or autonomous application of harness refinement.

## Delivery slices

1. Product shaping and selective context.
2. Task Graph, bounded loops, evidence, events, and status.
3. Provider/model policy, documentation, version alignment, and dogfood evidence.

## Acceptance and evidence

`npm run verify`, package smoke, plugin validation, performance budgets, compatibility tests, context and scope security tests, and BASS-040 reaching REVIEW with checksum-backed evidence.
