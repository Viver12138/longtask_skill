# longtask

**English** | [简体中文](README.zh-CN.md)

> Split a long task into independently verifiable sessions, and leave a handoff trail that survives context compaction.

An [Agent Skill](https://agentskills.io) — a plain `SKILL.md`, a platform-agnostic protocol, file templates and adapters. No dependencies, no scripts.

---

## The problem

Long agent tasks fail in two directions:

1. **Compaction eats the reasoning.** You spend an hour working out *why* an approach was rejected; the summary keeps the conclusion, not the reasoning. The next session re-proposes the rejected approach.
2. **Sessions don't hand off.** A new session has no idea what the previous one finished, so it re-explores the codebase — burning context on the exact work the last session already did.

`longtask` attacks both. Before any work starts it decomposes the task into sessions that each deliver something **independently verifiable**. Then it bootstraps a `.longtask/` directory that every later session reads before touching code.

## How it works

### Phase 1 — Planning (`/longtask`)

- **Judge first.** Three cases exit immediately: the task fits one context window, there is no verifiable deliverable, or requirements are still churning.
- **Detect capabilities.** File read/write, shell, Git, subagents and auto-loaded project instructions are platform capabilities, not assumptions. Unavailable ones are recorded and degraded explicitly.
- **Explore with a budget.** 5–10 key files plus one build or test run for an existing codebase; requirements, stack choices and directory skeleton for a greenfield one. Conclusions get written down, never kept only in context.
- **Split by deliverable, not by token count.** Each session must produce something a command can verify. If you can't write the check, the split is wrong — go back and re-cut.
- **Scaffold.** Create `.longtask/` with the protocol, the plan, a lightweight cursor and a session handoff skeleton.

### Phase 2 — Protocol (`.longtask/PROTOCOL.md`)

The execution protocol is **platform-agnostic**; adapters such as `AGENTS.md` only tell a new session to read it.

- Read the protocol, the plan, the cursor and the current session's handoff before doing anything.
- Rewrite the cursor at every checkpoint, using a safe write (temp file → validate → atomic replace where supported).
- Verify against a recorded environment. A failure caused by an environment mismatch is not a code regression.
- Close in **two phases**: prepare the handoff and show its summary, then mark it handed off only after the user confirms.
- On a new session, **re-run the previous session's verification commands** before continuing.
- If a handoff is missing, recover from the actual files and Git state — never guess.

### Session states

`PLANNED → IN_PROGRESS → VERIFYING → READY_FOR_HANDOFF → HANDED_OFF`

With `BLOCKED` and `FAILED` branches. Implementation complete, verification passed and handoff confirmed are three different things.

## Install

The repository root **is** the skill package; there is no nested `longtask/` directory.

```bash
git clone https://github.com/Viver12138/longtask_skill.git /tmp/longtask_skill
mkdir -p ~/.kscc/skills/longtask
cp -r /tmp/longtask_skill/{SKILL.md,references,adapters} ~/.kscc/skills/longtask/
```

Or project-scoped:

```bash
mkdir -p .kscc/skills/longtask
cp -r /tmp/longtask_skill/{SKILL.md,references,adapters} .kscc/skills/longtask/
```

For other platforms, copy the same three paths into that platform's skills directory. See [`adapters/generic.md`](adapters/generic.md).

## Usage

On a platform with slash commands:

```text
/longtask
```

Then describe the task. The skill will either plan it or tell you it doesn't need planning.

On other platforms, describe the long task and ask for longtask planning, or paste the fallback line:

> This project has an active long task. Read `.longtask/PROTOCOL.md`, `.longtask/PLAN.md` and `.longtask/STATE.md`, then the current session's `S<nn>.md`, before starting. Do not modify code before re-running the previous session's verification.

## Capability degradation

| Capability | If unavailable |
|---|---|
| Read project files | Ask the user to paste content; stop if key files are unreadable |
| Write project files | Output full file contents for the user to save; never claim it was written |
| Shell | Generate commands for the user to run and report exit codes |
| Git | Use file lists and user-provided version info |
| Auto-load project instructions | Manual startup line |
| Subagents | Main agent runs sequentially |
| Slash commands | Natural-language trigger |

The rule is the same everywhere: **never describe a planned action as an executed and verified one.**

## The `.longtask/` files

| File | Written | Size | Purpose |
|---|---|---|---|
| `PROTOCOL.md` | once, at planning | — | Platform-agnostic execution protocol, pinned per task |
| `PLAN.md` | once, then revised with a change log | — | Goal, completion criteria, constraints, environment, session table, current decisions, deprecated decisions, change log |
| `STATE.md` | every checkpoint | ≤ 5 lines (plus note) | Cursor: session, state, in-flight deliverable, next concrete action, owner, Git baseline |
| `S01.md`, `S02.md`, … | once, at session close | ≤ 60 lines | Handoff: conclusion and verification evidence, decisions, rejected options, traps, threads, first command, Git status |
| `reports/S<nn>-<name>.md` | per subagent | — | Subagent report, so findings survive compaction |

Everything belongs in git. These are decision records, not scratch space.

## Design principles

- **Write only what code can't reconstruct.** Git has the diff. Tests can be re-run. The code is readable. What's missing is *why*.
- **Facts over files.** Project files and Git outrank `PLAN.md`, which outranks `STATE.md`, which outranks the handoff. No single state file replaces verification.
- **Append history, revise decisions.** History is append-only; current decisions may change, but every change leaves a record and moves the old decision to "deprecated".
- **High frequency, low frequency.** The cursor is cheap enough to rewrite constantly; the handoff is expensive and written once. Together they cover both crashes and clean session breaks.
- **No predicting compaction.** An agent cannot know when it will be compacted, so "save before compaction" is impossible. Write at checkpoints instead.
- **Two-phase handoff.** Show the handoff before asking for confirmation; confirm before marking it done.
- **Honest degradation.** If you cannot execute or verify, say so and hand the command to the user.

## Anti-patterns

- **Forcing every task through the workflow** — a skill that can't say "you don't need me" can't be trusted.
- **Splitting from the user's description alone** — a plan built without reading the code gets overturned by session two.
- **Duplicating the protocol into `AGENTS.md`** — adapters must point at `PROTOCOL.md`, or versions drift.
- **Writing a changelog into the handoff** — it will grow into the very compaction problem it was meant to solve.
- **"Continue implementing X" as the next command** — the next session still won't know what to type.
- **Treating a missing handoff as no work done** — recover from files and Git; never guess.
