# BASS instruction audit — 2026-09-07

This is an audit record, not an always-loaded instruction or a new runtime feature. Scope: BASS core guidance, six plugin skills and their interface metadata, role/critic prompts, common/CLI/server/web/game/nan2026 profiles, root/generated AGENTS and host shims, hooks, and product/task templates.

The external [six-category checklist](https://x.com/Gencoin8/status/2096819118595084431) motivated the review. [OpenAI guidance](https://developers.openai.com/api/docs/guides/latest-model) supports auditing conflicting instructions and proportional verification; it does not establish that every skill is obsolete or that a fixed checklist guarantees better model behavior.

| Category | Finding and action | Retained boundary |
| --- | --- | --- |
| Long or broad descriptions | Shortened all six skill descriptions to their actual task/trigger. Kept detailed behavior in the body. | Skill names, interfaces, host portability and explicit capability selection remain. No claim that these descriptions were actually truncated. |
| Missing progressive disclosure | Composer injected all profile discovery checks and critic names. Discovery now receives its checklist; other roles receive only planned critic names. HTML and UI skills retain only a conditional portable CLI reference. | Existing skills are short and already separated by function, so no extra router/reference files were added. The plugin validator's shared launcher contract remains. |
| Rigid recipes | Work no longer requires separate gate/graph commands already enforced at entry. Planner prepares contracts without activating implementation; discovery limits its checklist to the current question. Runtime recommendation runs only when selection is needed. | Actual execution ordering, provider claim/run/reuse/uncertain behavior, attempts, scope and records remain. |
| Forced context | Both composer guidance and the context selector treated every web-profile task as UI work. UI context/preparation now depends on task scope, explicit context, or a requested design critic. | Relevant UI work still gets DESIGN context; explicit references, secret/path guards, context budgets and checksums remain. |
| Excess verification | Consolidated repeated guide retry/stop/log rules; read-only requests no longer imply an implementation loop. | Task-appropriate tests, security/data boundaries, material-UI rendered evidence and release checks remain. No tests were removed because a model might run them automatically. |
| Excess permission language | Shaping preserves chosen names/direction; setup proceeds with an already requested upgrade; runtime commands reuse explicit action/target selection. Compose shows approved/pending/rejected policy states; guide no longer tells a rejected task to proceed. | Existing policy records and gates remain authoritative. No rejection, final approval, publication, or external-provider permission is fabricated. |

## Kept after review

- Root/generated AGENTS and Codex/Claude/Cursor shims are already small entrypoints to the dynamic contract. Their repository ownership, release and evidence boundaries remain.
- SessionStart is a compact entrypoint; scope hooks protect allowed paths. Neither needs an added audit checklist.
- Profiles describe domain facts: CLI exit/help behavior, server API/data/auth/rollback checks, web accessibility, game runtime selection, and the explicit event-only overlay. These are retained, with discovery content loaded for the proper role.
- Critic prompts describe evidence, severity, reproducibility and domain checks. Their source format and review independence are retained; invocation remains limited by ExecutionPlan.
- Product/technical/design templates already separate confirmed decisions from proposals and allow irrelevant sections to be omitted. No replacement template set is introduced.
- Model routing, approval policy, evaluator configuration, Task Graph and schemas are unchanged.

## Validation and limits

Regression tests cover composition and read-only guidance across common, CLI, server, web, game and nan2026; approved/pending/rejected decisions; UI versus non-UI work; explicit and inferred DESIGN references. Existing security, gate and evidence tests remain required. Skill review includes setup, shaping, HTML, UI, runtime and implementation scenarios rather than a game-only walkthrough.

Counts and checksums are recorded in `.bass/evidence/BASS-052/`. Text reduction is not a token-cost benchmark or proof of improved live Codex/Claude behavior. This audit does not edit globally installed plugins or automatically propagate changes into previously generated repositories.
