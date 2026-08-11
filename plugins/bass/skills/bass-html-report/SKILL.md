---
name: bass-html-report
description: Generate a standalone HTML handoff report only when HTML is the requested final artifact and BASS execution_plan calls bass:html-report. Build from an existing run record without re-summarizing it through the model.
---

# BASS HTML Report

1. Require an existing `.bass/records/<task-id>.json` or legacy `records/<task-id>.json`.
2. Run `node "${CLAUDE_PLUGIN_ROOT}/skills/bass-html-report/scripts/render-report.cjs" <record.json> <report.html>`.
3. Use the bundled fixed layout and status components. Do not add a new design system or dependency.
4. Do not paste the generated HTML back into model context. Inspect it only when the user requested visual QA.
5. Return the report path and any source-record validation error.
