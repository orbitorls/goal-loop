import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EvalResult, EvalSpec, GoalContract, ProofSpec } from "./types.js";

function assertNever(x: never): never {
  throw new Error(`Unhandled eval kind: ${String(x)}`);
}

function shellPath(): string {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

function runShell(command: string, cwd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: shellPath(),
    });
    return { ok: true, output: output ?? "" };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = [e.stdout ?? "", e.stderr ?? "", e.message ?? ""]
      .filter(Boolean)
      .join("\n");
    return { ok: false, output };
  }
}

function checkProofFreshness(
  workspace: string,
  proof: ProofSpec | undefined,
  startedAtMs: number,
): boolean {
  if (!proof?.path) return true;
  const proofPath = resolve(workspace, proof.path);
  if (!existsSync(proofPath)) return false;
  try {
    const mtime = statSync(proofPath).mtimeMs;
    return mtime >= startedAtMs;
  } catch {
    return false;
  }
}

function evalCommand(
  spec: Extract<EvalSpec, { kind: "command" }>,
  workspace: string,
): { ok: boolean; output: string } {
  const cwd = spec.cwd ? resolve(workspace, spec.cwd) : workspace;
  return runShell(spec.command, cwd);
}

function evalProofFile(
  spec: Extract<EvalSpec, { kind: "proof-file" }>,
  workspace: string,
): { ok: boolean; output: string } {
  const filePath = resolve(workspace, spec.path);
  if (!existsSync(filePath)) {
    return { ok: false, output: `Proof file missing: ${filePath}` };
  }
  const content = readFileSync(filePath, "utf8");
  if (spec.contains && !content.includes(spec.contains)) {
    return {
      ok: false,
      output: `Proof file ${filePath} does not contain expected string: ${spec.contains}`,
    };
  }
  return { ok: true, output: `Proof file present: ${filePath}` };
}

function evalGitChecks(
  spec: Extract<EvalSpec, { kind: "git-checks" }>,
  workspace: string,
): { ok: boolean; output: string } {
  const lines: string[] = [];
  let ok = true;

  if (spec.branch) {
    const branchResult = runShell("git rev-parse --abbrev-ref HEAD", workspace);
    lines.push(branchResult.output.trim());
    if (!branchResult.ok || branchResult.output.trim() !== spec.branch) {
      ok = false;
      lines.push(
        `Expected branch ${spec.branch}, got ${branchResult.output.trim() || "(unknown)"}`,
      );
    }
  }

  const checks = spec.checks ?? [];
  for (const check of checks) {
    const result = runShell(check, workspace);
    lines.push(`$ ${check}\n${result.output}`);
    if (!result.ok) ok = false;
  }

  if (checks.length === 0 && !spec.branch) {
    const status = runShell("git status --porcelain", workspace);
    lines.push(status.output);
    // Clean tree is not required; just confirm git works
    if (!status.ok && !existsSync(join(workspace, ".git"))) {
      ok = false;
      lines.push("Not a git repository");
    }
  }

  return { ok, output: lines.join("\n") };
}

export interface EvalRunnerOptions {
  workspace: string;
  /** Epoch ms used for proof freshness; defaults to now if omitted. */
  startedAtMs?: number;
}

export class EvalRunner {
  constructor(private readonly options: EvalRunnerOptions) {}

  run(contract: GoalContract): EvalResult {
    const startedAtMs = this.options.startedAtMs ?? Date.now();
    const workspace = this.options.workspace;
    const spec = contract.eval;

    let result: { ok: boolean; output: string };
    switch (spec.kind) {
      case "command":
        result = evalCommand(spec, workspace);
        break;
      case "proof-file":
        result = evalProofFile(spec, workspace);
        break;
      case "git-checks":
        result = evalGitChecks(spec, workspace);
        break;
      default:
        return assertNever(spec);
    }

    const proofFresh = checkProofFreshness(workspace, contract.proof, startedAtMs);
    const pass = result.ok && proofFresh;
    const output = proofFresh
      ? result.output
      : `${result.output}\nProof is stale or missing (mtime before run start).`;

    return { pass, output, proofFresh };
  }
}
