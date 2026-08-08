import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FailureReason,
  IterationLogEntry,
  RunState,
  SessionStatus,
} from "./types.js";

export function createRunId(): string {
  return randomUUID().slice(0, 8);
}

export function createInitialState(opts: {
  runId: string;
  contractPath: string;
  host: string;
  workspace: string;
  maxIterations: number;
}): RunState {
  const now = new Date().toISOString();
  return {
    runId: opts.runId,
    contractPath: opts.contractPath,
    host: opts.host,
    workspace: opts.workspace,
    status: "pending",
    currentIteration: 0,
    maxIterations: opts.maxIterations,
    iterations: [],
    startedAt: now,
    updatedAt: now,
  };
}

export function runStatePath(runsDir: string, runId: string): string {
  return join(runsDir, runId, "state.json");
}

export function saveRunState(runsDir: string, state: RunState): void {
  const path = runStatePath(runsDir, state.runId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

export function loadRunState(runsDir: string, runId: string): RunState {
  const path = runStatePath(runsDir, runId);
  if (!existsSync(path)) {
    throw new Error(`Run state not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as RunState;
}

export function findLatestRunId(runsDir: string): string | undefined {
  if (!existsSync(runsDir)) return undefined;
  const entries = readdirSync(runsDir)
    .map((name) => {
      const full = join(runsDir, name);
      try {
        return { name, mtime: statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((e): e is { name: string; mtime: number } => e !== null)
    .sort((a, b) => b.mtime - a.mtime);
  return entries[0]?.name;
}

export function appendIteration(
  state: RunState,
  entry: Omit<IterationLogEntry, "timestamp"> & { timestamp?: string },
): RunState {
  const next: RunState = {
    ...state,
    currentIteration: entry.iteration,
    updatedAt: new Date().toISOString(),
    iterations: [
      ...state.iterations,
      {
        ...entry,
        timestamp: entry.timestamp ?? new Date().toISOString(),
      },
    ],
  };
  return next;
}

export function markRunning(state: RunState): RunState {
  return {
    ...state,
    status: "running",
    updatedAt: new Date().toISOString(),
  };
}

export function markPassed(state: RunState): RunState {
  return {
    ...state,
    status: "passed",
    updatedAt: new Date().toISOString(),
    failureReason: undefined,
  };
}

export function markFailed(
  state: RunState,
  reason: FailureReason,
): RunState {
  return {
    ...state,
    status: "failed",
    failureReason: reason,
    updatedAt: new Date().toISOString(),
  };
}

export function markCancelled(state: RunState): RunState {
  return {
    ...state,
    status: "cancelled",
    failureReason: "cancelled",
    updatedAt: new Date().toISOString(),
  };
}

export function failureFromSession(
  status: SessionStatus | undefined,
): FailureReason {
  switch (status) {
    case "error":
      return "agent_error";
    case "exited":
      return "agent_error";
    case "running":
    case "idle":
    case undefined:
      return "eval_fail";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
