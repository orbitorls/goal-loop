import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { FailureReason, IterationLogEntry, RunState } from "./types.js";

export function createRunState(
  contractPath: string,
  host: string,
  workspace: string,
  maxIterations: number,
): RunState {
  const now = new Date().toISOString();
  return {
    runId: randomUUID(),
    contractPath,
    host,
    workspace,
    status: "pending",
    currentIteration: 0,
    maxIterations,
    iterations: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function getRunsDir(workspace: string): string {
  return join(workspace, ".goal-loop", "runs");
}

export function getRunDir(workspace: string, runId: string): string {
  return join(getRunsDir(workspace), runId);
}

export function saveRunState(state: RunState, workspace: string): void {
  const runDir = getRunDir(workspace, state.runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "state.json"), JSON.stringify(state, null, 2), "utf-8");
}

export function loadRunState(workspace: string, runId: string): RunState | null {
  const statePath = join(getRunDir(workspace, runId), "state.json");
  if (!existsSync(statePath)) {
    return null;
  }
  return JSON.parse(readFileSync(statePath, "utf-8")) as RunState;
}

export function findLatestRun(workspace: string): RunState | null {
  const runsDir = getRunsDir(workspace);
  if (!existsSync(runsDir)) {
    return null;
  }
  const entries = readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const statePath = join(runsDir, e.name, "state.json");
      if (!existsSync(statePath)) {
        return null;
      }
      const stat = statSync(statePath);
      return { runId: e.name, mtime: stat.mtimeMs };
    })
    .filter((e): e is { runId: string; mtime: number } => e !== null)
    .sort((a, b) => b.mtime - a.mtime);

  if (entries.length === 0) {
    return null;
  }
  return loadRunState(workspace, entries[0].runId);
}

export function appendIteration(
  state: RunState,
  entry: Omit<IterationLogEntry, "timestamp">,
): RunState {
  const updated: RunState = {
    ...state,
    currentIteration: entry.iteration,
    updatedAt: new Date().toISOString(),
    iterations: [
      ...state.iterations,
      { ...entry, timestamp: new Date().toISOString() },
    ],
  };
  return updated;
}

export function markRunStatus(
  state: RunState,
  status: RunState["status"],
  failureReason?: FailureReason,
): RunState {
  return {
    ...state,
    status,
    failureReason,
    updatedAt: new Date().toISOString(),
  };
}

export function touchIterationMarker(workspace: string, runId: string): void {
  const runDir = getRunDir(workspace, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, ".iteration-start"), new Date().toISOString(), "utf-8");
}
