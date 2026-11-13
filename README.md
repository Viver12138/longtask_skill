# longtask

**English** | [简体中文](README.zh-CN.md)

Split tasks across context windows into verifiable work units. Keep decisions, progress and recovery evidence in `.longtask/`.

A platform-independent Agent Skill built from Markdown instructions and templates. Task execution needs no additional runtime. Source maintenance checks use Node.js 20 or later, with no third-party dependencies.

## Usage

- “Use longtask to plan this cross-module refactor. Do not implement yet.”
- “Continue until this goal is complete, saving checkpoints for recovery.”
- “Resume the existing longtask from its current progress.”

Use `/longtask` only on platforms that support it. Small tasks proceed normally without scaffolding. Research and writing also qualify when they have reviewable deliverables.

**A work unit is not a chat window.** One chat can finish multiple units; after compaction, the same unit can resume. Planning alone does not authorize implementation. Existing authorization to continue does not require a fresh confirmation at every handoff.

## Workflow

1. Inspect the relevant project and constraints; define scope and overall acceptance.
2. Split by deliverables, with checks, actual dependencies and change boundaries.
3. Save a pinned protocol, plan and current cursor.
4. Checkpoint progress. Verify and draft each handoff before freezing it under user confirmation or applicable prior authorization.
5. On recovery, establish ownership, inspect artifacts and unfinished operations, then verify required dependencies before proceeding.
6. Mark completion only after all necessary deliverables and task-level acceptance pass and the final handoff is complete.

| File | Purpose |
|---|---|
| `PROTOCOL.md` | Task-pinned rules and versions |
| `PLAN.md` | Scope, dependencies, historical state, validity, decisions and authorization sources |
| `STATE.md` | Current unit, progress, next action, owner and baseline |
| `S01.md`, etc. | Handoff evidence and reasoning; append corrections after freezing |
| `LOCK` | Ownership record, where reliable atomic creation is available |
| `TRANSITION`, `transitions/` | Multi-file update intent and before/after evidence; never a business-operation replay queue |
| `.state.bak` | Last valid backup for non-atomic writes |
| `reports/` | Optional subagent results |

Initialize only the first three files. Create other records when needed. Missing write capability means persistence has not been established; unexecuted checks are not passes.

## Install

The repository root is the skill package. Copy `SKILL.md`, `references/` and `adapters/` into a `longtask` folder under your platform's configured skills directory. Treat first installation and upgrades separately to preserve existing changes.

See [generic adaptation](adapters/generic.md) for POSIX Shell and PowerShell examples, the minimal package, and a short project loader. No platform-specific path or automatic loading behavior is assumed.

Manual recovery prompt:

> Continue this project's longtask. Read `.longtask/PROTOCOL.md`, `.longtask/PLAN.md` and `.longtask/STATE.md`. Follow the pinned protocol to establish ownership, inspect unfinished transitions and artifacts, then resume the current unit or select one whose dependencies are satisfied. Do not blindly repeat operations with side effects.

## Boundaries

- The plan's rule register is an index; it cannot revoke platform-loaded instructions or grant new permissions.
- Verification can execute commands or review documents and other artifacts against explicit criteria and evidence.
- Inspect non-idempotent operation results before retrying. Authorization alone does not justify repetition.
- An agent without ownership does not write shared task state. A file lock does not guarantee isolation during forced takeover.
- Preserve user edits, essential evidence and frozen history; line-count guidance must not discard recovery information.
- Existing tasks retain their pinned protocol. Installation does not silently migrate tasks or infer prior authorization.
- Keep completed records. Authorized archives use `.longtask/archive/task-<slug>-<YYYYMMDD>-<short-id>/` without overwriting existing archives.

## Validation and maturity

Run in the source repository:

```sh
node scripts/validate.mjs
node --test scripts/validate.test.mjs
```

Static checks cover entry metadata, encoding, links, state sets, the complete transition allowlist, state projections, essential template fields and permissions. Regression tests verify that the checker rejects invalid inputs. This is not a longtask execution engine and does not prove compliance with every natural-language rule.

The [validation matrix](references/validation.md) describes protocol simulation and real-agent scenarios. **Protocol simulation and cross-platform real-agent integration have not been executed; this remains a controlled trial.** Checker tests are not concurrency, cross-chat recovery or protocol integration tests. CI runs both commands above.

## Documentation

- [Skill entry](SKILL.md): routing, planning and selective reading.
- [Protocol](references/protocol.md): execution and recovery rules.
- [Templates](references/templates.md): plan, cursor, handoff, lock and transition records.
- [Examples](references/examples.md): cases that require careful decisions.
- [Design](docs/longtask-design.md): responsibilities and tradeoffs.

## License

[MIT License](LICENSE).
