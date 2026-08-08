#!/usr/bin/env node
/**
 * Goal Loop stop hook — eval-gated (not promise-only).
 * Works with Cursor IDE (followup_message) and Claude Code (ok/reason).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const hookFormat =
  process.env.GOAL_LOOP_HOOK_FORMAT ??
  (process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR
    ? "claude"
    : "cursor");

const workspace =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.CURSOR_PROJECT_DIR ||
  process.cwd();

const contractPath =
  process.env.GOAL_LOOP_CONTRACT ||
  join(workspace, ".goal-loop", "active-goal.yaml");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);

function allowStop() {
  if (hookFormat === "claude") {
    process.stdout.write(JSON.stringify({ ok: true }));
  } else {
    process.stdout.write(JSON.stringify({}));
  }
}

function blockStop(message) {
  if (hookFormat === "claude") {
    process.stdout.write(JSON.stringify({ ok: false, reason: message }));
  } else {
    process.stdout.write(JSON.stringify({ followup_message: message }));
  }
}

if (!existsSync(contractPath)) {
  allowStop();
  process.exit(0);
}

try {
  const core = await import("@goal-loop/core");
  const contract = core.loadContract(contractPath);
  const stateFile = join(
    workspace,
    ".goal-loop",
    hookFormat === "claude" ? "claude-gate-state.json" : "cursor-gate-state.json",
  );

  let iteration = 1;
  if (existsSync(stateFile)) {
    try {
      iteration =
        (JSON.parse(readFileSync(stateFile, "utf8")).iteration || 0) + 1;
    } catch {
      iteration = 1;
    }
  }
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ iteration }, null, 2));

  const decision = core.evaluateInSessionGate({
    contract,
    workspace,
    iteration,
  });

  if (decision.allowStop) {
    allowStop();
  } else {
    blockStop(decision.followupMessage);
  }
} catch {
  allowStop();
}
