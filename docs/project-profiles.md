# Project profiles

| Profile | Purpose |
|---|---|
| `common` | shared model, workflow, and critic defaults |
| `web` | rendered UI and DESIGN.md checks |
| `server` | API, migration, authentication, and recovery risk |
| `cli` | command-line behavior |
| `game` | generic runtime recommendation and adapter contract |
| `nan2026` | event-only overlay extending `game` |

Profiles form an `extends` chain and are merged below project configuration. `game` evaluates dimension, targets, existing dependencies, team readiness, deployment, and license. `nan2026` adds only concept gate, time limit, evidence, trace, and session lock; ordinary game projects never inherit those event constraints.
