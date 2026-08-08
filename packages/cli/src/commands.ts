import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import {
  loadContract,
  resolveHost,
  runOrchestrator,
  findLatestRunId,
  loadRunState,
  markCancelled,
  saveRunState,
  createRunId,
  listAdapters,
  type GoalContract,
  type HostAdapter,
  type RunState,
} from "@goal-loop/core";
import { installCursorIdeHooks } from "@goal-loop/adapter-cursor-ide";
import { installClaudeCodeHooks } from "@goal-loop/adapter-claude-code";
import { registerAllAdapters } from "./register-adapters.js";
import { goalLoopDir, resolveRunsDir, resolveWorkspace } from "./paths.js";
import { installSkill } from "./skill-install.js";

export interface RunOptions {
  host: string;
  goal: string;
  workspace?: string;
  command?: string[];
  runsDir?: string;
}

function loadRunStateOrLatest(
  workspace: string,
  runId: string | undefined,
  runsDir?: string,
): RunState | null {
  const dir = resolveRunsDir(workspace, runsDir);
  try {
    if (runId) {
      return loadRunState(dir, runId);
    }
    const latestId = findLatestRunId(dir);
    if (!latestId) return null;
    return loadRunState(dir, latestId);
  } catch {
    return null;
  }
}

function applyCommandOverride(
  contract: GoalContract,
  commandParts?: string[],
): GoalContract {
  if (!commandParts?.length) return contract;
  const [command, ...args] = commandParts;
  return {
    ...contract,
    command,
    args: args.length > 0 ? args : contract.args,
  };
}

export async function runCommand(options: RunOptions): Promise<void> {
  registerAllAdapters();

  const workspace = resolveWorkspace(options.workspace);
  const contractPath = isAbsolute(options.goal)
    ? resolve(options.goal)
    : resolve(workspace, options.goal);
  const runsDir = resolveRunsDir(workspace, options.runsDir);

  let contract = loadContract(contractPath);
  contract = applyCommandOverride(contract, options.command);

  const hostId =
    options.host === "auto" ? (contract.host ?? "auto") : options.host;
  const adapter = resolveHost(hostId);

  const runId = createRunId();

  console.log(`Run id: ${runId}`);
  console.log(`Host: ${adapter.id}`);
  console.log(`Workspace: ${workspace}`);
  console.log(`Goal: ${contract.goal}`);
  console.log(`Max iterations: ${contract.max_iterations}`);

  const result = await runOrchestrator({
    contract,
    contractPath,
    adapter,
    workspace,
    runsDir,
    runId,
    onState: (state) => {
      console.log(
        `[iter ${state.currentIteration}] status=${state.status}`,
      );
    },
  });

  console.log(`\nRun id: ${result.state.runId}`);
  console.log(`Final status: ${result.state.status}`);

  if (result.passed) {
    console.log(
      `✓ Goal loop passed after ${result.state.currentIteration} iteration(s)`,
    );
    process.exit(0);
  }

  console.error(
    `✗ Goal loop failed: ${result.state.failureReason ?? "unknown"}`,
  );
  process.exit(1);
}

export function statusCommand(
  workspace?: string,
  runId?: string,
  runsDir?: string,
): void {
  const ws = resolveWorkspace(workspace);
  const state = loadRunStateOrLatest(ws, runId, runsDir);
  if (!state) {
    console.log("No runs found.");
    return;
  }
  console.log(JSON.stringify(state, null, 2));
}

export async function cancelCommand(
  workspace?: string,
  runId?: string,
  runsDir?: string,
): Promise<void> {
  registerAllAdapters();

  const ws = resolveWorkspace(workspace);
  const dir = resolveRunsDir(ws, runsDir);
  const state = loadRunStateOrLatest(ws, runId, runsDir);

  if (!state) {
    console.error("No run to cancel.");
    process.exit(1);
  }

  if (state.status !== "running" && state.status !== "pending") {
    console.log(`Run ${state.runId} is already ${state.status}.`);
    return;
  }

  const adapter = resolveHost(state.host);
  await adapter
    .cancel({ id: state.runId, adapterId: state.host })
    .catch(() => undefined);

  const cancelled = markCancelled(state);
  saveRunState(dir, cancelled);
  console.log(`Cancelled run ${state.runId}`);
}

const ACTIVE_GOAL_TEMPLATE = `goal: Describe your goal
acceptance: How you know it is done
eval:
  kind: command
  command: npm test
max_iterations: 10
host: auto
`;

function scaffoldGoalLoop(workspace: string): void {
  const base = goalLoopDir(workspace);
  mkdirSync(join(base, "runs"), { recursive: true });

  const activeGoalPath = join(base, "active-goal.yaml");
  if (!existsSync(activeGoalPath)) {
    writeFileSync(activeGoalPath, ACTIVE_GOAL_TEMPLATE, "utf8");
    console.log(`Created ${activeGoalPath}`);
  } else {
    console.log(`Active goal already exists: ${activeGoalPath}`);
  }
}

export function initCommand(
  host: string,
  workspace?: string,
  options?: { global?: boolean },
): void {
  const ws = resolveWorkspace(workspace);
  scaffoldGoalLoop(ws);

  switch (host) {
    case "skill": {
      const paths = installSkill({
        workspace: ws,
        targets: ["cursor", "claude"],
        global: options?.global,
      });
      console.log(`Installed Goal Loop skill:`);
      for (const p of paths) console.log(`  ${p}`);
      break;
    }
    case "cursor-skill": {
      const paths = installSkill({
        workspace: ws,
        targets: ["cursor"],
        global: options?.global,
      });
      console.log(`Installed Goal Loop skill (Cursor):`);
      for (const p of paths) console.log(`  ${p}`);
      break;
    }
    case "claude-skill": {
      const paths = installSkill({
        workspace: ws,
        targets: ["claude"],
        global: options?.global,
      });
      console.log(`Installed Goal Loop skill (Claude Code):`);
      for (const p of paths) console.log(`  ${p}`);
      break;
    }
    case "cursor-ide": {
      const paths = installCursorIdeHooks(ws);
      console.log(`Installed Cursor IDE hooks:`);
      for (const p of paths) console.log(`  ${p}`);
      break;
    }
    case "claude-code": {
      const paths = installClaudeCodeHooks(ws);
      console.log(`Installed Claude Code hooks:`);
      for (const p of paths) console.log(`  ${p}`);
      break;
    }
    case "generic-shell":
    case "cursor-cloud":
    case "devin":
    case "codex":
      console.log(
        `Scaffold ready for host '${host}'. Point active-goal.yaml at your contract and run: goal-loop run --host ${host} --goal .goal-loop/active-goal.yaml`,
      );
      break;
    default: {
      console.log(
        `Unknown host '${host}'. Scaffold created; use a registered adapter id with 'goal-loop doctor'.`,
      );
    }
  }
}

function checkAdapterReady(adapter: HostAdapter): boolean {
  switch (adapter.id) {
    case "cursor-cloud":
      return Boolean(
        process.env.CURSOR_API_KEY ?? process.env.CURSOR_CLOUD_API_KEY,
      );
    case "devin":
      return Boolean(process.env.DEVIN_API_KEY);
    case "codex":
    case "generic-shell":
    case "cursor-ide":
    case "claude-code":
      return true;
    default:
      return true;
  }
}

export function doctorCommand(): void {
  registerAllAdapters();
  const adapters = listAdapters().sort((a, b) => a.id.localeCompare(b.id));

  console.log("Goal Loop Doctor — Capability Matrix\n");
  console.log("| Adapter | Modes | Ready |");
  console.log("|---------|-------|-------|");

  for (const adapter of adapters) {
    const ready = checkAdapterReady(adapter);
    const modes = adapter.capabilities.modes.join(", ");
    console.log(`| ${adapter.id} | ${modes} | ${ready ? "✓" : "⚠"} |`);
  }

  console.log("\nEnvironment checks:");
  const cursorKey =
    process.env.CURSOR_API_KEY ?? process.env.CURSOR_CLOUD_API_KEY;
  console.log(`  CURSOR_API_KEY / CURSOR_CLOUD_API_KEY: ${cursorKey ? "set" : "missing"}`);
  console.log(`  DEVIN_API_KEY: ${process.env.DEVIN_API_KEY ? "set" : "missing"}`);
  console.log(`  Node: ${process.version}`);

  const cloudAdapters = adapters.filter(
    (a) => a.id === "cursor-cloud" || a.id === "devin",
  );
  for (const adapter of cloudAdapters) {
    if (!checkAdapterReady(adapter)) {
      console.warn(
        `\n⚠ ${adapter.id}: missing API key — cloud runs will fail until configured.`,
      );
    }
  }
}
