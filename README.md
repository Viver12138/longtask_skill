# longtask

**English** | [简体中文](README.zh-CN.md)

> Split a long task into independently verifiable sessions, and leave a handoff trail that survives context compaction.

An [Agent Skill](https://agentskills.io) — a plain `SKILL.md` plus two reference files. No dependencies, no scripts.

---

## The problem

Long agent tasks fail in two directions:

1. **Compaction eats the reasoning.** You spend an hour working out *why* an approach was rejected; the summary keeps the conclusion, not the reasoning. The next session re-proposes the rejected approach.
2. **Sessions don't hand off.** A new session has no idea what the previous one finished, so it re-explores the codebase — burning context on the exact work the last session already did.

`longtask` attacks both. Before any work starts it decomposes the task into sessions that each deliver something **independently verifiable**. Then it bootstraps a `.longtask/` directory that every later session reads before touching code.

## How it works

### Phase 1 — Planning (`/longtask`)

- **Judge first.** Three cases exit immediately: the task fits one context window, there is no verifiable deliverable, or requirements are still churning.
- **Explore with a budget.** 5–10 key files plus one build or test run for an existing codebase; requirements, stack choices and directory skeleton for a greenfield one. Conclusions get written down, never kept only in context.
- **Split by deliverable, not by token count.** Each session must produce something a command can verify. If you can't write the check, the split is wrong — go back and re-cut.
- **Scaffold.** Create `.longtask/` with the plan, a five-line cursor, and an empty session handoff.

### Phase 2 — Protocol (an `AGENTS.md` block)

- Read the cursor, the plan, and the current session's handoff before doing anything.
- Rewrite the cursor at every checkpoint.
- Pass six gates before writing a handoff. If any gate fails, record *where you're stuck* instead — a handoff that lies is worse than no handoff.
- On a new session, **re-run the previous session's verification commands** before continuing.

## Install

Copy the `longtask/` directory into your skills folder:

```bash
# global — available in every project
cp -r longtask ~/.kscc/skills/

# or project-scoped
mkdir -p .kscc/skills && cp -r longtask .kscc/skills/
```

## Usage

```bash
/longtask
```

Then describe the task. The skill will either plan it or tell you it doesn't need planning.

Once a plan exists, every new session picks it up automatically via `AGENTS.md`. If a session starts without that file loaded, paste the fallback line:

> This project has an active long task. Read `.longtask/STATE.md` and `.longtask/PLAN.md`, then the current session's `S0N.md`, before starting.

## The `.longtask/` files

| File | Written | Size | Purpose |
|---|---|---|---|
| `PLAN.md` | once, then append-only | — | Goal, completion criteria, constraints, session table, change log |
| `STATE.md` | every checkpoint | ≤ 5 lines | Cursor: current session, what's in flight, next concrete action |
| `S0N.md` | once, at session close | ≤ 60 lines | Handoff: conclusion, decisions, rejected options, traps, threads, first command |

All three belong in git. They are a decision record, not scratch space.

## Design principles

- **Write only what code can't reconstruct.** Git has the diff. Tests can be re-run. The code is readable. What's missing is *why* — and that's what a handoff is for.
- **High frequency, low frequency.** The cursor is cheap enough to rewrite constantly; the handoff is expensive and written once. Together they cover both crashes and clean session breaks.
- **No predicting compaction.** An agent cannot know when it will be compacted, so "save before compaction" is impossible. Write at checkpoints instead.
- **Subagents must persist.** A subagent's report only returns to its parent session. If it isn't written to `.longtask/`, it never happened.

## Anti-patterns

- **Forcing every task through the workflow** — a skill that can't say "you don't need me" can't be trusted.
- **Splitting from the user's description alone** — a plan built without reading the code gets overturned by session two.
- **Writing a changelog into `S0N.md`** — it will grow into the very compaction problem it was meant to solve.
- **"Continue implementing X" as the next command** — the next session still won't know what to type.
