---
name: bass-shape
description: Shape product requirements and delivery tasks before implementation, using existing repository decisions.
---

# BASS Shape

Resolve `../../scripts/bass-launcher.cjs` from this `SKILL.md` to an absolute path before any BASS CLI step. `<BASS>` below means `node <absolute launcher path>`.

1. Inspect existing code, documents, product behavior, and validation before proposing direction. Mark facts, decisions, assumptions, and open questions separately.
2. Fill only relevant sections of `PRODUCT.md`, `TECH.md`, and `DESIGN.md`; preserve existing confirmed decisions and never overwrite the files with blank templates.
3. Preserve the user's existing product and visual choices. Record only undecided name, brand, concept, or logo directions as candidates.
4. Create `specs/<feature>.md` only when work crosses multiple surfaces, needs staged delivery, or cannot fit one reviewable task. Small changes use one task directly.
5. Split delivery into tasks with acceptance, exclusions, dependencies, owned paths, rollback, and required evidence. Create each with `<BASS> task new <task-id> --title <title> --if-missing`, then fill its contract. Do not create parallel tasks whose paths overlap.
6. Use Ouroboros only when consequential ambiguity remains and the execution plan names it. Stop for the missing human decision instead of inventing it.
