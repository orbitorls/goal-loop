---
name: goal-loop
description: >-
  Eval-gated goal loops for coding agents. Use when working with Goal Contracts,
  .goal-loop/goal.yaml, eval-gated stop, measurable acceptance criteria, or
  goal-loop run/init/doctor. Never stop on promises alone — only when eval passes.
---

# Goal Loop Skill

Portable agent skill for measurable goals that must pass automated evaluation before stopping.

## Core rule: eval-gated stop

**Never stop on a promise alone.** Completion claims, `DONE`, `<promise>` tags, or model assertions are not stop conditions. A goal is done only when:

1. `EvalRunner` reports `pass === true`, or
2. `iteration >= max_iterations` (exhausted), or
3. The user cancels the run.

## Defer to host gate or orchestrator

When a host gate or outer orchestrator is active, **do not self-stop** on eval failure:

| Layer | When | Your role |
|-------|------|-------------|
| In-session gate | Cursor IDE / Claude Code stop hooks installed | Let the hook run `EvalRunner`; accept follow-up messages from the gate |
| Outer orchestrator | `goal-loop run` with any adapter | The orchestrator polls, evals, and injects `on_continue` — keep working until eval passes |
| No harness | You are the only loop | Run eval yourself after each iteration; fix and continue until pass or `max_iterations` |

If hooks are missing but you have a contract, prefer `goal-loop run --host auto` over manual stop decisions.

## Goal Contract fields

| Field | Required | Description |
|-------|----------|-------------|
| `goal` | yes | What to achieve |
| `acceptance` | yes | Measurable definition of done |
| `eval` | yes | How pass/fail is decided (see below) |
| `max_iterations` | yes | Hard ceiling on continuation attempts |
| `host` | no | Adapter id or `auto` (default resolution order in docs) |
| `workspace` | no | Working directory override |
| `on_continue` | no | Template on eval fail: `{{iteration}}`, `{{goal}}`, `{{acceptance}}`, `{{eval_output}}` |
| `proof` | no | Optional proof artifact: `path`, `description` — must be fresh (mtime ≥ run start) |
| `command` | no | Outer CLI command (`generic-shell`, `codex`) |
| `args` | no | CLI args; use `{{prompt}}` for continuation text |

### Eval kinds

```yaml
# Run a shell command; exit 0 = pass
eval:
  kind: command
  command: npm test
  cwd: ./subdir   # optional

# Check file exists and optional substring
eval:
  kind: proof-file
  path: PROOF.txt
  contains: "DONE"

# Git branch + optional check commands
eval:
  kind: git-checks
  branch: main
  checks:
    - npm test
```

## Fallback: generic-shell

When the host is unknown or no native adapter is available:

```bash
goal-loop run --host generic-shell --goal goal.yaml --workspace .
```

Minimal contract:

```yaml
goal: Your goal
acceptance: Eval passes
eval:
  kind: command
  command: node -e "process.exit(0)"
max_iterations: 10
host: generic-shell
command: node
args:
  - "-e"
  - "console.log('{{prompt}}')"
on_continue: |
  Iteration {{iteration}} failed.
  {{eval_output}}
  Continue: {{goal}}
```

## Host quick reference

| Situation | Command |
|-----------|---------|
| Cursor IDE (hooks) | `goal-loop init --host cursor-ide` then work in IDE |
| Claude Code (hooks) | `goal-loop init --host claude-code` |
| Cloud / API | `goal-loop run --host cursor-cloud` or `--host devin` |
| Codex CLI | `goal-loop run --host codex` |
| Any CLI / fallback | `goal-loop run --host generic-shell` |
| Auto pick adapter | `goal-loop run --host auto` |

## Agent workflow

1. Read `.goal-loop/goal.yaml` or the path passed to `goal-loop run`.
2. Work toward `acceptance` using normal tools.
3. After each meaningful iteration, ensure eval can pass (or let orchestrator eval).
4. On failure, use `eval_output` and `on_continue` to fix gaps — do not declare completion.
5. Stop only when eval passes or iterations are exhausted.

## Install (skill only)

| Target | Project path | Global path |
|--------|--------------|-------------|
| Cursor | `.cursor/skills/goal-loop/` | `~/.cursor/skills/goal-loop/` |
| Claude Code | `.claude/skills/goal-loop/` | `~/.claude/skills/goal-loop/` |

```bash
goal-loop init --host skill                      # both hosts, project scope
goal-loop init --host cursor-skill               # Cursor only
goal-loop init --host claude-skill               # Claude Code only
goal-loop init --host skill --global             # both hosts, user home
```

Or copy `skills/goal-loop/` manually, or install the plugin bundle under `plugins/goal-loop/`.
