import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ContinuePayload,
  Evidence,
  HostAdapter,
  RunContext,
  SessionHandle,
  SessionSnapshot,
} from "@goal-loop/core";

interface ShellSessionMeta {
  workspace: string;
  runsDir: string;
  runId: string;
  command: string;
  args: string[];
  child?: ChildProcess;
  status: SessionSnapshot["status"];
  output: string;
  error?: string;
  exitCode?: number;
  lastPrompt: string;
}

const sessions = new Map<string, ShellSessionMeta>();

function renderArgs(args: string[], prompt: string): string[] {
  return args.map((a) => a.replaceAll("{{prompt}}", prompt));
}

function buildInitialPrompt(ctx: RunContext): string {
  return [
    `Goal: ${ctx.contract.goal}`,
    `Acceptance: ${ctx.contract.acceptance}`,
    "",
    "Work until the acceptance criteria can pass the eval.",
    "Do not claim completion without making the eval pass.",
  ].join("\n");
}

function runCommand(
  meta: ShellSessionMeta,
  prompt: string,
): Promise<void> {
  return new Promise((resolve) => {
    meta.status = "running";
    meta.output = "";
    meta.error = undefined;
    meta.lastPrompt = prompt;

    const args = renderArgs(meta.args, prompt);
    // If no {{prompt}} placeholder was used, append prompt via stdin
    const hasPlaceholder = meta.args.some((a) => a.includes("{{prompt}}"));

    const child = spawn(meta.command, args, {
      cwd: meta.workspace,
      shell: true,
      env: process.env,
      stdio: hasPlaceholder ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
    });
    meta.child = child;

    if (!hasPlaceholder && child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      meta.output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      meta.output += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      meta.status = "error";
      meta.error = err.message;
      resolve();
    });

    child.on("close", (code) => {
      meta.exitCode = code ?? 1;
      meta.status = code === 0 ? "idle" : "exited";
      if (code !== 0) {
        meta.error = `Command exited with code ${code}`;
      }
      const logDir = join(meta.runsDir, meta.runId);
      mkdirSync(logDir, { recursive: true });
      writeFileSync(
        join(logDir, `shell-iter-${Date.now()}.log`),
        meta.output,
        "utf8",
      );
      resolve();
    });
  });
}

/**
 * Outer CLI loop driver: runs a configurable command with {{prompt}} template.
 * Works with any CLI harness (codex, claude, custom scripts).
 */
export function createGenericShellAdapter(
  defaults?: { command?: string; args?: string[] },
): HostAdapter {
  return {
    id: "generic-shell",
    capabilities: { modes: ["outerCli"] },

    async start(ctx: RunContext): Promise<SessionHandle> {
      const command = ctx.contract.command ?? defaults?.command ?? "echo";
      const args =
        ctx.contract.args ??
        defaults?.args ??
        (command === "echo" || command === "Write-Output"
          ? ["{{prompt}}"]
          : ["{{prompt}}"]);

      const handle: SessionHandle = {
        id: `shell-${ctx.runId}`,
        adapterId: "generic-shell",
        metadata: {},
      };

      const meta: ShellSessionMeta = {
        workspace: ctx.workspace,
        runsDir: ctx.runsDir,
        runId: ctx.runId,
        command,
        args,
        status: "idle",
        output: "",
        lastPrompt: "",
      };
      sessions.set(handle.id, meta);

      await runCommand(meta, buildInitialPrompt(ctx));
      return handle;
    },

    async continue(handle: SessionHandle, delta: ContinuePayload): Promise<void> {
      const meta = sessions.get(handle.id);
      if (!meta) throw new Error(`Unknown session: ${handle.id}`);
      await runCommand(meta, delta.message);
    },

    async poll(handle: SessionHandle): Promise<SessionSnapshot> {
      const meta = sessions.get(handle.id);
      if (!meta) {
        return { status: "error", error: `Unknown session: ${handle.id}` };
      }
      return {
        status: meta.status,
        output: meta.output,
        error: meta.error,
        exitCode: meta.exitCode,
      };
    },

    async cancel(handle: SessionHandle): Promise<void> {
      const meta = sessions.get(handle.id);
      if (!meta?.child) return;
      meta.child.kill();
      meta.status = "exited";
      meta.error = "cancelled";
    },

    async collectEvidence(handle: SessionHandle): Promise<Evidence> {
      const meta = sessions.get(handle.id);
      return {
        artifacts: meta
          ? [join(meta.runsDir, meta.runId)]
          : [],
        metadata: { lastPrompt: meta?.lastPrompt },
      };
    },
  };
}

export const genericShellAdapter = createGenericShellAdapter();
