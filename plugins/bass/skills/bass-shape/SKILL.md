---
name: bass-shape
description: Turn a product idea into repository-grounded PRODUCT.md, TECH.md, DESIGN.md, an optional feature spec, and reviewable BASS tasks when the user asks to define, shape, name, architect, design, scope, or decompose a product before implementation.
---

# BASS Shape

1. Inspect existing code, documents, product behavior, and validation before proposing direction. Mark facts, decisions, assumptions, and open questions separately.
2. Fill only relevant sections of `PRODUCT.md`, `TECH.md`, and `DESIGN.md`; preserve existing confirmed decisions and never overwrite the files with blank templates.
3. Record name, brand, concept, and logo directions as candidates. A human owns the final product and visual choice.
4. Create `specs/<feature>.md` only when work crosses multiple surfaces, needs staged delivery, or cannot fit one reviewable task. Small changes use one task directly.
5. Adapt the useful sequence from ECC, gstack, and Spec Kit—principles, clarify, specify, technical plan, reviewable tasks—into the three root documents, an optional feature spec, and BASS tasks. Do not copy their prompt suites or create duplicate sources of truth.
6. Split delivery into tasks with acceptance, exclusions, dependencies, owned paths, rollback, and required evidence. Do not create parallel tasks whose paths overlap.
7. Use Ouroboros only when consequential ambiguity remains and the execution plan names it. Stop for the missing human decision instead of inventing it.
