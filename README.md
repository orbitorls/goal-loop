# Goal Loop

Harness-agnostic goal loop with **eval-gated stop**. Cursor, Claude Code, Devin, Codex, and any CLI harness share one Goal Contract; adapters bridge host-specific continuation to a common orchestrator.

## Quick start (easiest)

```bash
# One-shot — no clone required
npx --yes github:orbitorls/goal-loop#npm init
npx --yes github:orbitorls/goal-loop#npm doctor
npx --yes github:orbitorls/goal-loop#npm run --host generic-shell --goal goal.yaml
```

After publishing to npm (`goal-loop-cli`), the short form works too:

```bash
npx goal-loop-cli init
npx goal-loop-cli doctor
```

Global install (optional):

```bash
npm install -g github:orbitorls/goal-loop#npm
goal-loop init
goal-loop doctor
```

### From this repo (contributors)

```bash
git clone https://github.com/orbitorls/goal-loop.git
cd goal-loop
npm install
npm run build
npm test
```

### Local eval demo (Windows-friendly)

```powershell
cd examples/local-eval-demo
.\run-demo.ps1
```

Or manually:

```powershell
cd examples/local-eval-demo
npx goal-loop-cli run --host generic-shell --goal goal.yaml --workspace .
```

### Adapter smoke test

```powershell
cd examples/adapter-smoke
npx goal-loop-cli run --host generic-shell --goal goal.yaml --workspace .
```

## Stop rules

A run ends successfully only when **eval passes**. Never on promise strings, `DONE`, or model claims.

| Outcome | Condition |
|---------|-----------|
| Pass | `EvalRunner.pass === true` |
| Fail | `max_iterations` exhausted without eval pass |
| Cancelled | `goal-loop cancel` or abort |
| Fail | Timeout or agent/session error |

In-session gates (Cursor IDE, Claude Code) and the outer orchestrator (`goal-loop run`) both use `EvalRunner` — agents should defer to them when present.

**Fallback** when no native adapter fits:

```bash
goal-loop run --host generic-shell --goal goal.yaml --workspace .
```

## Goal Contract

Place at `.goal-loop/goal.yaml` or pass `--goal`:

```yaml
goal: Implement feature X
acceptance: Tests pass
eval:
  kind: command
  command: npm test
max_iterations: 10
host: auto
on_continue: |
  Iteration {{iteration}} failed eval.
  {{eval_output}}
```

Fields: `goal`, `acceptance`, `eval`, `max_iterations` (required); `host`, `workspace`, `on_continue`, `proof`, `command`, `args` (optional). See [skills/goal-loop/SKILL.md](skills/goal-loop/SKILL.md).

Eval kinds: `command`, `proof-file`, `git-checks`.

## Install: Skill, Plugin, or CLI

Goal Loop works locally without cloud E2E. Pick one or combine skill + hooks.

### Agent skill (Cursor / Claude Code)

Teaches the agent eval-gated stop and Goal Contract fields. No hooks required.

```bash
# Project scope (recommended)
npx goal-loop-cli init
# or with explicit host:
npx goal-loop-cli init --host skill --workspace .

# Cursor or Claude only
npx goal-loop-cli init --host cursor-skill --workspace .
npx goal-loop-cli init --host claude-skill --workspace .

# User-wide (~/.cursor/skills or ~/.claude/skills)
npx goal-loop-cli init --host skill --global
```

Manual copy: `skills/goal-loop/` → `.cursor/skills/goal-loop/` or `.claude/skills/goal-loop/`.

### Plugin bundle (skill + Stop hook)

Self-contained under `plugins/goal-loop/`:

| Host | Install |
|------|---------|
| Claude Code | `claude plugin install ./plugins/goal-loop` |
| Cursor | Add local plugin path `plugins/goal-loop` in Cursor plugin settings |

See [plugins/goal-loop/README.md](plugins/goal-loop/README.md). Hooks need `@goal-loop/core` (`npm install goal-loop` in the project or globally).

### CLI + in-session hooks

```bash
npm install
npm run build
npm run goal-loop -- init --host cursor-ide --workspace .
npm run goal-loop -- init --host claude-code --workspace .
```

From npm: `npx goal-loop-cli init --host cursor-ide`.

| Command | Description |
|---------|-------------|
| `goal-loop run --host <id\|auto> --goal <path>` | Run orchestrator loop |
| `goal-loop status` | Latest run state (JSON) |
| `goal-loop cancel` | Cancel active run |
| `goal-loop init --host <id>` | Scaffold + hooks or skill |
| `goal-loop doctor` | Adapter matrix + env checks |

From repo root: `npm run goal-loop -- run --host auto --goal path/to/goal.yaml`.

## Project layout

```
packages/core/       Contract, EvalRunner, orchestrator, registry, remote eval
packages/cli/        CLI commands and adapter registration
adapters/
  generic-shell/     Outer CLI fallback ({{prompt}} template)
  cursor-ide/        Cursor IDE stop hook
  claude-code/       Claude Code Stop hook
  cursor-cloud/      Cursor Cloud Agents API
  devin/             Devin Sessions API
  codex/             Codex CLI via shell
examples/
  local-eval-demo/   proof-file + PROOF.txt smoke demo
  adapter-smoke/     Minimal generic-shell smoke
skills/goal-loop/    Portable agent skill
plugins/goal-loop/   Cursor + Claude Code plugin bundle
docs/
  capability-matrix.md
  adapter-authoring.md
```

Run artifacts: `.goal-loop/runs/<run-id>/` (state JSON, goal copy, logs).

## Adapters

| Adapter | Mode |
|---------|------|
| `generic-shell` | Outer CLI (universal fallback) |
| `cursor-ide` | In-session stop hook |
| `claude-code` | In-session Stop hook |
| `cursor-cloud` | Cursor Cloud Agents API |
| `devin` | Devin Sessions API v3 |
| `codex` | Codex CLI via shell |

## Documentation

- [Capability matrix](docs/capability-matrix.md) — harnesses, failure taxonomy, remote eval
- [Adapter authoring](docs/adapter-authoring.md) — add a host in one file + register
- [Agent skill](skills/goal-loop/SKILL.md) — portable skill for coding agents

## License

MIT
