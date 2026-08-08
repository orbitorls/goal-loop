import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  evaluateInSessionGate,
  loadContract,
  type ContinuePayload,
  type Evidence,
  type HostAdapter,
  type RunContext,
  type SessionHandle,
  type SessionSnapshot,
} from "@goal-loop/core";

/**
 * Claude Code Stop hook adapter.
 * Compatible with Ralph-style state files, but stop is eval-gated (not promise-only).
 */
export const claudeCodeAdapter: HostAdapter = {
  id: "claude-code",
  capabilities: { modes: ["inSessionGate"] },

  async start(ctx: RunContext): Promise<SessionHandle> {
    const statePath = join(ctx.runsDir, ctx.runId, "claude-code.json");
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({ mode: "in-session", iteration: 0 }, null, 2),
    );
    return {
      id: `claude-code-${ctx.runId}`,
      adapterId: "claude-code",
      metadata: { statePath },
    };
  },

  async continue(_handle: SessionHandle, _delta: ContinuePayload): Promise<void> {
    // Delivered via Stop hook decision (block + reason / follow-up).
  },

  async poll(handle: SessionHandle): Promise<SessionSnapshot> {
    return { status: "idle", output: String(handle.metadata?.statePath ?? "") };
  },

  async cancel(_handle: SessionHandle): Promise<void> {},

  async collectEvidence(handle: SessionHandle): Promise<Evidence> {
    return { metadata: handle.metadata };
  },
};

export interface ClaudeStopDecision {
  /** When true, Claude Code should prevent stopping. */
  block: boolean;
  reason?: string;
}

export function evaluateClaudeStop(opts: {
  workspace: string;
  contractPath: string;
  statePath?: string;
}): ClaudeStopDecision {
  const contract = loadContract(opts.contractPath);
  const statePath =
    opts.statePath ?? join(opts.workspace, ".goal-loop", "claude-gate-state.json");

  let iteration = 1;
  if (existsSync(statePath)) {
    try {
      const raw = JSON.parse(readFileSync(statePath, "utf8")) as {
        iteration?: number;
      };
      iteration = (raw.iteration ?? 0) + 1;
    } catch {
      iteration = 1;
    }
  }
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ iteration }, null, 2));

  const decision = evaluateInSessionGate({
    contract,
    workspace: opts.workspace,
    iteration,
  });

  if (decision.allowStop) {
    return { block: false };
  }

  return {
    block: true,
    reason: decision.followupMessage,
  };
}

export function installClaudeCodeHooks(workspace: string): string[] {
  const hooksDir = join(workspace, ".claude", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const scriptPath = join(hooksDir, "goal-loop-stop.mjs");
  const settingsPath = join(workspace, ".claude", "settings.json");

  const script = `#!/usr/bin/env node
/**
 * Claude Code Stop hook — eval-gated (not promise-only).
 * Exit 0 + JSON { ok: true } to allow stop; { ok: false, reason } to block.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const workspace = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const contractPath =
  process.env.GOAL_LOOP_CONTRACT ||
  join(workspace, ".goal-loop", "active-goal.yaml");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

if (!existsSync(contractPath)) {
  process.stdout.write(JSON.stringify({ ok: true }));
  process.exit(0);
}

try {
  const core = await import("@goal-loop/core");
  const contract = core.loadContract(contractPath);
  const stateFile = join(workspace, ".goal-loop", "claude-gate-state.json");
  let iteration = 1;
  if (existsSync(stateFile)) {
    try {
      iteration = (JSON.parse(readFileSync(stateFile, "utf8")).iteration || 0) + 1;
    } catch {}
  }
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ iteration }, null, 2));

  const decision = core.evaluateInSessionGate({ contract, workspace, iteration });
  if (decision.allowStop) {
    process.stdout.write(JSON.stringify({ ok: true }));
  } else {
    process.stdout.write(
      JSON.stringify({ ok: false, reason: decision.followupMessage }),
    );
  }
} catch (err) {
  process.stdout.write(JSON.stringify({ ok: true }));
}
`;
  writeFileSync(scriptPath, script, "utf8");

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      settings = {};
    }
  }
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  hooks.Stop = [
    {
      hooks: [
        {
          type: "command",
          command: `node "${scriptPath.replace(/\\/g, "/")}"`,
        },
      ],
    },
  ];
  settings.hooks = hooks;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");

  return [scriptPath, settingsPath];
}
