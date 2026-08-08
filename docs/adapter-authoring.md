# Adapter Authoring

Goal Loop is an adapter platform. A new harness needs one `HostAdapter` implementation plus CLI registration — no orchestrator changes.

## HostAdapter (one file)

Implement in `adapters/my-host/src/index.ts`:

```ts
import type {
  HostAdapter,
  RunContext,
  SessionHandle,
  SessionSnapshot,
  ContinuePayload,
} from "@goal-loop/core";

export function createMyHostAdapter(): HostAdapter {
  return {
    id: "my-host",
    capabilities: { modes: ["outerCli"] }, // or inSessionGate | outerApi | proofOnly

    async start(ctx: RunContext): Promise<SessionHandle> {
      // spawn session / install gate context
      return { id: "...", adapterId: "my-host" };
    },

    async continue(handle: SessionHandle, delta: ContinuePayload): Promise<void> {
      // send follow-up after eval fail
    },

    async poll(handle: SessionHandle): Promise<SessionSnapshot> {
      // running | idle | exited | error
      return { status: "idle" };
    },

    async cancel(handle: SessionHandle): Promise<void> {},

  };
}
```

Optional `collectEvidence()` for cloud adapters (branch, PR URL, artifacts).

## Capability modes

| Mode | Use when | Continue mechanism |
|------|----------|-------------------|
| `inSessionGate` | Host has stop/stop-hook event | Block stop; return follow-up message |
| `outerApi` | Remote session API | POST message / follow-up run |
| `outerCli` | CLI harness | Re-run `command` with `{{prompt}}` |
| `proofOnly` | Evidence only | No session control |

## Register (one line)

In `packages/cli/src/register-adapters.ts`:

```ts
import { createMyHostAdapter } from "@goal-loop/adapter-my-host";

// add to adapters array:
createMyHostAdapter(),
```

Add workspace entry in root `package.json` if new package: `adapters/my-host`.

## Patterns

**In-session gate** — see `adapters/cursor-ide/src/stop-hook.ts` and `adapters/claude-code/src/stop-hook.ts`. On stop: load contract → `evaluateInSessionGate()` → allow or inject follow-up. Never match promise strings.

**Outer CLI** — see `adapters/generic-shell`. Spawn process, poll until idle, let orchestrator eval, continue with `on_continue`.

**Outer API** — see `adapters/cursor-cloud` or `adapters/devin`. Create session, poll status, send continue payload, optional `runRemoteEval()`.

## Fallback without a native adapter

Users can always use `generic-shell`:

```yaml
host: generic-shell
command: my-agent-cli
args: ["--prompt", "{{prompt}}"]
```

## Checklist

1. `adapters/my-host/package.json` → depends on `@goal-loop/core`
2. `src/index.ts` → `HostAdapter` implementation
3. Register in `register-adapters.ts`
4. Add row to `docs/capability-matrix.md`
5. Optional: `goal-loop init --host my-host` hook installer
