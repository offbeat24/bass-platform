# BASS-057 simplicity review

- Uses Node built-ins for HTTP, crypto, filesystem access, and child process launch; the browser view uses platform HTML, CSS, and JavaScript. No runtime dependency was added.
- Reuses the existing BASS status builder and v1–v3 event reader, including the completed BASS-056 semantic history and BASS-058 resume event. The observer does not rewrite persistent workflow events.
- Keeps the addition to one observer module and one small shared hook bridge. Hook events are optional, bounded, redacted, and best-effort; previews remain in memory.
- Task cards open a numbered, task-filtered history and return to the overview without a new route or frontend dependency.
- Gives start, attempt, tool, validation, evidence, review, and result steps distinct semantic colors and symbols, with a short navigation transition and reduced-motion support; step styling is driven by existing event kinds rather than a new phase model.
- Rendered review passed at desktop and 390px mobile widths; mobile document width matched the viewport. Browser console errors came only from injected extensions, with no observer-origin errors.
- The overview adds status counts and filters plus recent, status, ID, and title sorting; browser interaction checks confirmed correct grouping/order, preserved choices during polling, and no mobile overflow.
- The active task detail derives one current step from an open attempt, unfinished capability, or running local tool event and displays it separately above the numbered history. Completed attempts and inactive tasks show no live-step panel.
- Attempt 6 Chrome review confirmed the current `ponytail:full` event above step 01 while the 68 history entries were still chronological; focused tests cover a running tool and a completed task.
- Attempt 7 reverses only the task-detail presentation: canonical event data stays chronological, while the visible history runs newest first with its original sequence numbers. Chrome showed 72, 71, 70, 69 at the top and 01 at the bottom; the live-step callout remains separate above the list.
- Keeps pre-review checks for recorded capability calls valid across task-plan revisions by checking each call against the fingerprint stored on its own attempt.
- The page is read-only, loopback-only, token-protected, and renders event values through text nodes.
- No high or medium simplicity findings. The intentional limits are one local project/process, one-second polling, and a bounded in-memory tool-event list.
