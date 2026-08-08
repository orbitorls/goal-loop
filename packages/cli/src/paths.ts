import { join, resolve } from "node:path";

export function resolveWorkspace(path?: string): string {
  return resolve(path ?? process.cwd());
}

export function resolveRunsDir(workspace: string, runsDir?: string): string {
  return runsDir ? resolve(runsDir) : join(workspace, ".goal-loop", "runs");
}

export function goalLoopDir(workspace: string): string {
  return join(workspace, ".goal-loop");
}
