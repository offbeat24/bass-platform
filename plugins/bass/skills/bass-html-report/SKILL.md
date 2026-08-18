---
name: bass-html-report
description: Generate a standalone HTML handoff report only when HTML is the requested final artifact and BASS execution_plan calls bass:html-report. Build from an existing run record without re-summarizing it through the model.
---

# BASS HTML Report

Resolve paths from this `SKILL.md`. The shared BASS launcher is `../../scripts/bass-launcher.cjs`; the deterministic renderer is `scripts/render-report.cjs`. Convert either path to an absolute path before execution.

1. Require an existing `.bass/records/<task-id>.json` or legacy `records/<task-id>.json`.
2. Run `node <absolute renderer path> <record.json> <report.html>`.
3. Use the bundled fixed layout and status components. Do not add a new design system or dependency.
4. Do not paste the generated HTML back into model context. Inspect it only when the user requested visual QA.
5. Return the report path and any source-record validation error.
