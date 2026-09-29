---
name: bass-shape
description: Turn an undefined product or feature request into BASS requirements and tasks. Use when scope or acceptance needs shaping; not for an already defined task.
---

# BASS Shape

Resolve `../../scripts/bass-launcher.cjs` from this `SKILL.md` to an absolute path before any BASS CLI step. `<BASS>` below means `node <absolute launcher path>`.

1. Inspect only evidence needed to resolve the requested scope. Reuse existing task contracts and decisions; do not repeat discovery for an already defined change. Mark facts, decisions, assumptions, and open questions separately.
2. Fill only relevant sections of `PRODUCT.md`, `TECH.md`, and `DESIGN.md`; preserve existing confirmed decisions and never overwrite the files with blank templates.
3. Preserve the user's existing product and visual choices. Record only undecided name, brand, concept, or logo directions as candidates.
4. Create `specs/<feature>.md` only when work crosses multiple surfaces, needs staged delivery, or cannot fit one reviewable task. Small changes use one task directly.
5. Split delivery into reviewable tasks. Every task needs a problem, shipping outcome, acceptance criteria, and verification. When BASS computes an eligible Fast plan (low risk, at most two changed surfaces, no policy approval; not delete/release), leave excluded scope, context, and task-level rollback empty when they do not affect the work. Keep the full capture contract for Standard/Hardened, policy-gated, delete, and release tasks. Implementation tasks name literal allowed paths before starting; read-only exploration can omit them, but must add them before review if it changes project files. Add forbidden paths, dependencies, owned paths, custom stop conditions, and extra evidence only when they matter. The completion record still states how to recover or that no special rollback was needed. Create each task with `<BASS> task new <task-id> --title <title> --if-missing`, then fill the applicable contract. Do not create parallel tasks whose paths overlap.
6. Use Ouroboros only when consequential ambiguity remains and the execution plan names it. Stop for the missing human decision instead of inventing it.
