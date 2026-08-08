import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Evidence, GoalContract } from "./types.js";
import { EvalRunner } from "./eval.js";

export type RemoteEvalStrategy = "local" | "git-branch" | "pr-checks";

export interface RemoteEvalOptions {
  strategy: RemoteEvalStrategy;
  workspace: string;
  contract: GoalContract;
  evidence?: Evidence;
  startedAtMs?: number;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled strategy: ${String(x)}`);
}

function shellPath(): string {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

function fetchBranchEvidence(workspace: string, branch?: string): Evidence {
  const evidence: Evidence = { artifacts: [] };
  try {
    if (branch) {
      execSync(`git fetch origin ${branch}`, {
        cwd: workspace,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: shellPath(),
      });
      evidence.branch = branch;
    } else {
      const current = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: workspace,
        encoding: "utf8",
        shell: shellPath(),
      }).trim();
      evidence.branch = current;
    }
  } catch (err) {
    evidence.metadata = {
      fetchError: err instanceof Error ? err.message : String(err),
    };
  }
  return evidence;
}

/**
 * Shared remote/local eval strategies for cloud and outer hosts.
 */
export function runRemoteEval(options: RemoteEvalOptions) {
  const { strategy, workspace, contract, startedAtMs } = options;

  switch (strategy) {
    case "local": {
      const runner = new EvalRunner({ workspace, startedAtMs });
      return { ...runner.run(contract), evidence: options.evidence };
    }
    case "git-branch": {
      const evidence = fetchBranchEvidence(
        workspace,
        options.evidence?.branch ??
          (contract.eval.kind === "git-checks" ? contract.eval.branch : undefined),
      );
      const runner = new EvalRunner({ workspace, startedAtMs });
      return { ...runner.run(contract), evidence };
    }
    case "pr-checks": {
      const evidence = options.evidence ?? {};
      // Prefer gh when available; otherwise fall back to local eval.
      if (existsSync(join(workspace, ".git"))) {
        try {
          const pr = execSync("gh pr checks --json name,state,bucket 2>nul || gh pr checks", {
            cwd: workspace,
            encoding: "utf8",
            shell: shellPath(),
            stdio: ["ignore", "pipe", "pipe"],
          });
          const failed = /fail/i.test(pr);
          return {
            pass: !failed && pr.trim().length > 0,
            output: pr,
            proofFresh: true,
            evidence: { ...evidence, metadata: { ...(evidence.metadata ?? {}), prChecks: pr } },
          };
        } catch (err) {
          const runner = new EvalRunner({ workspace, startedAtMs });
          const local = runner.run(contract);
          return {
            ...local,
            evidence: {
              ...evidence,
              metadata: {
                ...(evidence.metadata ?? {}),
                prChecksError: err instanceof Error ? err.message : String(err),
              },
            },
          };
        }
      }
      const runner = new EvalRunner({ workspace, startedAtMs });
      return { ...runner.run(contract), evidence };
    }
    default:
      return assertNever(strategy);
  }
}
