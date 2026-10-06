# BASS design identity

## Purpose

BASS should feel like a quiet, trustworthy control contract. Important state must remain readable in plain files and terminal output; the optional local observer gives the same state a live view.

## Design principles

- Lead with outcome, blocker, or next decision.
- Show limits and unknown metrics honestly.
- Keep task, evidence, and provider state scannable without hiding details in color or animation.
- Preserve repository-native visual identity in generated projects.

## Layout and responsiveness

CLI output is line-oriented and stable for terminal capture. JSON output is the machine interface. Markdown artifacts use shallow headings and compact tables where comparison matters.

## Design References

- `oh-my-design` and `getdesign.md` are unavailable in this workspace. The closest documented candidates are [Session Observer](https://github.com/Ax-For/session-observer) for local-first event visibility and bounded history, and [Agents Observe](https://github.com/simple10/agents-observe) for a merged tool-event timeline. Selected axes: keep BASS's quiet dark blue-gray surfaces, add clear phase symbols and colors, and use motion only to signal navigation or live connection state.
- Keep the first view focused on BASS task and budget state, with a compact event list below. Task cards open a numbered, chronological history with a clear return action. Use status labels and short, redacted previews; omit transcript replay, multi-session navigation, and persistent tool payloads.
- Use BASS's dark blue-gray surfaces with muted teal status accents. Give start/resume, attempt, tool, validation, evidence, review, and result distinct readable labels, symbols, and phase colors; never rely on color alone.
- Show task counts with filters for active, waiting, attention, completed, and cancelled work. Keep the exact state on each card and let users sort by recent activity, status, ID, or title.
- In an active task detail, pin the current step above the numbered chronological history. Keep the callout distinct from history so sequence numbers and event order remain stable.
- Use brief view-transition motion and a restrained live-connection cue. Do not animate the whole timeline on each poll, and honor `prefers-reduced-motion`.

## Interaction states

Commands distinguish pass, warning, failure, needs decision, and needs expert. `status --watch` prints only changed snapshots and exits cleanly on Ctrl-C.
`bass observe` puts the active task and its remaining budgets first, then shows task evidence and the latest BASS and local tool events in time order. Selecting a task card opens newest-first process steps while keeping their original chronological numbers (oldest 01 at the bottom, newest at the top), and pins the current step above that list when one is available; the overview remains one action away.

## Voice and microcopy

Direct, factual, and specific. Never describe an unverified action as complete or convert an internal state into a request for ceremonial approval.

## Accessibility

Meaning must not depend on color. Text and JSON status remain usable in basic terminals and assistive workflows.

## Do

Expose source, checksum, omission reason, budget, and concrete blocker when relevant.

## Do not

Add a hosted dashboard, decorative progress animation, hidden background execution, or duplicate product/design systems.

## Decisions and history

0.5 retains terminal and file interfaces while adding host labels, plan fingerprints, and capability claim states. The local observer is optional and read-only; task files and event history remain authoritative.
