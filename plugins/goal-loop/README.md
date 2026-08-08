# Goal Loop Plugin

Portable plugin bundle: agent skill + eval-gated Stop hook. No cloud E2E required.

## Prerequisites

Install Goal Loop so hooks can import `@goal-loop/core`:

```bash
npm install -g goal-loop
# or in your project:
npm install goal-loop
```

## Claude Code

From the Goal Loop repo (or a copy of `plugins/goal-loop/`):

```bash
claude plugin install ./plugins/goal-loop
```

Then scaffold a contract in your project:

```bash
goal-loop init --host claude-code --workspace .
```

Hooks read `.goal-loop/active-goal.yaml` (or `GOAL_LOOP_CONTRACT`).

## Cursor

Install the local Cursor plugin:

1. Open **Cursor Settings → Rules / Plugins** (or use the plugin marketplace UI).
2. Add a local plugin path pointing at `plugins/goal-loop` in this repo.

Or install hooks only (no plugin UI):

```bash
goal-loop init --host cursor-ide --workspace .
```

## Skill only

```bash
goal-loop init --host skill --workspace .
```

Copies `skills/goal-loop/` to `.cursor/skills/goal-loop/` and `.claude/skills/goal-loop/`.
