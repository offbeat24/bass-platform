---
name: bass-ui-direction
description: Define a concise visual direction before a new UI or material redesign when BASS execution_plan calls bass:ui-direction. Do not use for small UI fixes; inherit the repository's existing DESIGN.md instead.
---

# BASS UI Direction

Only run when `execution_plan.capabilityCalls` includes `bass:ui-direction`.

Inspect the rendered product, existing components, tokens, and `DESIGN.md`. Then add or refresh one short `## Direction` section covering:

- aesthetic intent and what to avoid;
- information density and hierarchy;
- type scale and typography character;
- color roles, contrast, and surface treatment;
- motion purpose, duration character, and reduced-motion behavior.

Resolve conflicts with existing product evidence explicitly. Do not copy another vendor's skill text or create speculative design systems. Implement after direction is stable, then render desktop and mobile once at the end of the meaningful UI change.
