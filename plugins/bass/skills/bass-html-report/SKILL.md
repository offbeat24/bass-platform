---
name: bass-html-report
description: Render an existing BASS run record as HTML when HTML is requested and the plan calls bass:html-report.
---

# BASS HTML Report

If CLI inspection is needed, resolve `../../scripts/bass-launcher.cjs` relative to this file and invoke it with Node.

Resolve `scripts/render-report.cjs` relative to this file to an absolute path.

1. Require an existing `.bass/records/<task-id>.json` or legacy `records/<task-id>.json`.
2. Run `node <absolute renderer path> <record.json> <report.html>`.
3. Use the bundled fixed layout and status components. Do not add a new design system or dependency.
4. Do not paste the generated HTML back into model context. Inspect it only when the user requested visual QA.
5. Return the report path and any source-record validation error.
