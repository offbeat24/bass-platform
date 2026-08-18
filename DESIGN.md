# BASS design identity

## Purpose

BASS should feel like a quiet, trustworthy control contract rather than another agent dashboard. Important state must be readable in plain files and terminal output.

## Design principles

- Lead with outcome, blocker, or next decision.
- Show limits and unknown metrics honestly.
- Keep task, evidence, and provider state scannable without hiding details in color or animation.
- Preserve repository-native visual identity in generated projects.

## Layout and responsiveness

CLI output is line-oriented and stable for terminal capture. JSON output is the machine interface. Markdown artifacts use shallow headings and compact tables where comparison matters.

## Interaction states

Commands distinguish pass, warning, failure, needs decision, and needs expert. `status --watch` prints only changed snapshots and exits cleanly on Ctrl-C.

## Voice and microcopy

Direct, factual, and specific. Never describe an unverified action as complete or convert an internal state into a request for ceremonial approval.

## Accessibility

Meaning must not depend on color. Text and JSON status remain usable in basic terminals and assistive workflows.

## Do

Expose source, checksum, omission reason, budget, and concrete blocker when relevant.

## Do not

Add dashboards, decorative progress animation, hidden background execution, or duplicate product/design systems before demonstrated need.

## Decisions and history

0.5 retains terminal and file interfaces while adding host labels, plan fingerprints, and capability claim states. A web console remains explicitly deferred.
