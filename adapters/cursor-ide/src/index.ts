import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  ContinuePayload,
  Evidence,
  HostAdapter,
  RunContext,
  SessionHandle,
  SessionSnapshot,
} from "@goal-loop/core";

/** * Cursor IDE adapter is primarily an in-session gate via stop hooks.
 * Outer start/continue are no-ops that record intent for doctor/status.
 */
export const cursorIdeAdapter: HostAdapter = {
  id: "cursor-ide",
  capabilities: { modes: ["inSessionGate"] },

  async start(ctx: RunContext): Promise<SessionHandle> {
    const statePath = join(ctx.runsDir, ctx.runId, "cursor-ide.json");
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({ mode: "in-session", iteration: 0 }, null, 2),
    );
    return {
      id: `cursor-ide-${ctx.runId}`,
      adapterId: "cursor-ide",
      metadata: { statePath, note: "Use stop hook; outer start is advisory only" },
    };
  },

  async continue(_handle: SessionHandle, _delta: ContinuePayload): Promise<void> {
    // Continuation is delivered via followup_message from the stop hook.
  },

  async poll(handle: SessionHandle): Promise<SessionSnapshot> {
    return {
      status: "idle",
      output: String(handle.metadata?.note ?? "in-session gate"),
    };
  },

  async cancel(_handle: SessionHandle): Promise<void> {
    // No outer process to cancel.
  },

  async collectEvidence(handle: SessionHandle): Promise<Evidence> {
    return { metadata: handle.metadata };
  },
};

export function installCursorIdeHooks(workspace: string): string[] {
  const hooksDir = join(workspace, ".cursor");
  mkdirSync(hooksDir, { recursive: true });
  const hooksPath = join(hooksDir, "hooks.json");
  const hookScript = join(hooksDir, "goal-loop-stop.mjs");

  const hooks = {
    version: 1,
    hooks: {
      stop: [
        {
          command: `node "${hookScript.replace(/\\/g, "/")}"`,
          loop_limit: 50,
        },
      ],
    },
  };
  writeFileSync(hooksPath, JSON.stringify(hooks, null, 2), "utf8");

  const script = `#!/usr/bin/env node
/**
 * Cursor stop hook — eval-gated. Never stop on promise strings alone.
 * Reads goal from .goal-loop/active-goal.yaml (or GOAL_LOOP_CONTRACT).
 * Emits JSON: { followup_message? } when eval fails.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const workspace = process.env.CURSOR_PROJECT_DIR || process.cwd();

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const input = Buffer.concat(chunks).toString("utf8");
  let payload = {};
  try { payload = input.trim() ? JSON.parse(input) : {}; } catch { /* ignore */ }

  const contractPath =
    process.env.GOAL_LOOP_CONTRACT ||
    join(workspace, ".goal-loop", "active-goal.yaml");

  if (!existsSync(contractPath)) {
    // No active goal — allow stop
    process.stdout.write(JSON.stringify({}));
    return;
  }

  let core;
  try {
    core = await import("@goal-loop/core");
  } catch {
    // Fallback: allow stop if core not installed
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const contract = core.loadContract(contractPath);
  const stateFile = join(workspace, ".goal-loop", "cursor-gate-state.json");
  let iteration = 1;
  if (existsSync(stateFile)) {
    try {
      iteration = (JSON.parse(readFileSync(stateFile, "utf8")).iteration || 0) + 1;
    } catch { /* ignore */ }
  }
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ iteration }, null, 2));

  const decision = core.evaluateInSessionGate({
    contract,
    workspace,
    iteration,
  });

  if (decision.allowStop) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  process.stdout.write(
    JSON.stringify({ followup_message: decision.followupMessage }),
  );
}

main().catch((err) => {
  console.error(err);
  process.stdout.write(JSON.stringify({}));
});
`;
  writeFileSync(hookScript, script, "utf8");
  return [hooksPath, hookScript];
}

export { evaluateCursorStop } from "./stop-hook.js";
