#!/usr/bin/env node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { evaluateClaudeStop } from "./index.js";

const workspace = process.env.GOAL_LOOP_WORKSPACE ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const contractPath =
  process.env.GOAL_LOOP_CONTRACT ?? join(workspace, ".goal-loop", "active-goal.yaml");

if (!existsSync(contractPath)) {
  process.stdout.write(JSON.stringify({ ok: true }));
  process.exit(0);
}

const decision = evaluateClaudeStop({ workspace, contractPath });
if (decision.block) {
  process.stdout.write(JSON.stringify({ ok: false, reason: decision.reason }));
} else {
  process.stdout.write(JSON.stringify({ ok: true }));
}
