#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evaluateInSessionGate, loadContract } from "@goal-loop/core";

/**
 * Standalone Cursor stop hook entry (JSON stdin → JSON stdout).
 * loop_limit should be set from contract.max_iterations in hooks.json.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function evaluateCursorStop(opts: {
  workspace: string;
  contractPath: string;
  iteration: number;
}): { followup_message?: string } {
  const contract = loadContract(opts.contractPath);
  const decision = evaluateInSessionGate({
    contract,
    workspace: opts.workspace,
    iteration: opts.iteration,
  });
  if (decision.allowStop) return {};
  return { followup_message: decision.followupMessage };
}

async function main(): Promise<void> {
  await readStdin(); // consume hook payload
  const workspace = process.env.CURSOR_PROJECT_DIR || process.cwd();
  const contractPath =
    process.env.GOAL_LOOP_CONTRACT ||
    join(workspace, ".goal-loop", "active-goal.yaml");

  if (!existsSync(contractPath)) {
    process.stdout.write("{}\n");
    return;
  }

  const stateFile = join(workspace, ".goal-loop", "cursor-gate-state.json");
  let iteration = 1;
  if (existsSync(stateFile)) {
    try {
      iteration =
        (JSON.parse(readFileSync(stateFile, "utf8")) as { iteration?: number })
          .iteration ?? 0;
      iteration += 1;
    } catch {
      iteration = 1;
    }
  }
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ iteration }, null, 2));

  const out = evaluateCursorStop({ workspace, contractPath, iteration });
  process.stdout.write(JSON.stringify(out) + "\n");
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("stop-hook.js") ||
    process.argv[1].endsWith("stop-hook.ts"));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.stdout.write("{}\n");
    process.exit(0);
  });
}
