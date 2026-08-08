# Capability Matrix

Run `goal-loop doctor` for live adapter readiness and env checks.

## Harnesses vs adapters

| Harness | Adapter id | Continuation mode | How loop continues | Eval location | Notes |
|---------|------------|-------------------|--------------------|---------------|-------|
| Cursor IDE | `cursor-ide` | `inSessionGate` | Stop hook → follow-up message | Local workspace | `goal-loop init --host cursor-ide` |
| Claude Code | `claude-code` | `inSessionGate` | Stop hook (Ralph-compatible) | Local workspace | `goal-loop init --host claude-code` |
| Cursor Cloud | `cursor-cloud` | `outerApi` | Follow-up runs API | Remote + local/git | Needs `CURSOR_API_KEY` |
| Devin | `devin` | `outerApi` | POST session messages | Remote + local/git | Needs `DEVIN_API_KEY` |
| Codex | `codex` | `outerCli` | `codex exec` via shell | Local workspace | Wraps `generic-shell` |
| Any CLI | `generic-shell` | `outerCli` | Re-run `command` + `{{prompt}}` | Local workspace | Universal fallback |
| Unknown | `generic-shell` | `outerCli` | Template prompt | Local workspace | Default fallback |

## Stop conditions (all hosts)

| Condition | Stops? | `RunState.status` |
|-----------|--------|-------------------|
| Eval pass (`EvalRunner.pass`) | Yes (success) | `passed` |
| `iteration >= max_iterations` | Yes (failed) | `failed` |
| User `goal-loop cancel` | Yes (cancelled) | `cancelled` |
| Session timeout | Yes (failed) | `failed` |
| Agent/session error | Yes (failed) | `failed` |
| Promise / "DONE" / model claim | **No** | — |

## Failure taxonomy

`FailureReason` values recorded in run state:

| Reason | Meaning | Typical cause |
|--------|---------|---------------|
| `eval_fail` | Eval did not pass this iteration | Tests red, proof missing, git check failed |
| `max_iterations` | Ceiling reached without eval pass | Goal too large or harness stuck |
| `timeout` | Session did not become idle within limit | Hung CLI or API poll |
| `agent_error` | Adapter poll error or thrown exception | Crash, bad command, API error |
| `cancelled` | User or abort signal | `goal-loop cancel` |

Iteration log entries may carry `failureReason` per iteration (`eval_fail` on fail, absent on pass).

## Remote eval strategies

Used by cloud / outer API adapters via `runRemoteEval()` in `packages/core`:

| Strategy | When to use | Behavior |
|----------|-------------|----------|
| `local` | Agent works in local workspace | Standard `EvalRunner` on workspace |
| `git-branch` | Remote agent pushes to a branch | `git fetch` branch evidence, then local eval |
| `pr-checks` | PR exists with CI | `gh pr checks` if available; fallback to local eval |

Local eval kinds (all strategies ultimately use these for workspace checks):

| `eval.kind` | Pass condition |
|-------------|----------------|
| `command` | Shell command exits 0 |
| `proof-file` | File exists; optional `contains` substring |
| `git-checks` | Optional branch match + check commands exit 0 |

Proof freshness: if `proof.path` is set, file mtime must be ≥ run start.

## Auto host resolution

When `--host auto` or contract `host: auto`:

1. Contract `host` field if not `auto`
2. Registered adapters in order: `cursor-ide` → `claude-code` → `cursor-cloud` → `devin` → `codex` → `generic-shell`

## Environment variables

| Variable | Adapter |
|----------|---------|
| `CURSOR_API_KEY` / `CURSOR_CLOUD_API_KEY` | `cursor-cloud` |
| `DEVIN_API_KEY` | `devin` |
