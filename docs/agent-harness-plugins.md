# External capability plugins

BASS records provider selection; it does not copy or emulate an external plugin when that provider was selected.

## Ouroboros

Use the actual plugin only for consequential specification ambiguity, likely large rework, or high-risk semantic evaluation. The execution plan permits at most one pre-implementation seed/interview and one post-mechanical semantic evaluation. Clear fix and delete tasks do not call it.

## Ponytail

The installed plugin's SessionStart, SubagentStart, and UserPromptSubmit behavior remains authoritative. BASS requests `lite` for Fast and `full` for Standard/Hardened. `ultra` requires an explicit user request. When Ponytail is selected, BASS removes its own simplicity critic from the plan.

## Pen

Use the local Pen MCP only after project selection and only for requested UI exploration. Do not automatically call a second Pen AI agent. Headless CLI use is limited to render/export. Store exploration files under `design/explorations/<task-id>.pen`; source code remains the product SSOT.

## Doctor contract

`bass doctor --capabilities` reports `actual-plugin`, `builtin`, `off`, `missing`, or `unauthenticated`, plus whether host session activation can be confirmed and whether a restart is needed. Global plugin hooks may affect more than one project, so project selection and host activation are deliberately separate fields.
