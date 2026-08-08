import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderContinueMessage } from "./contract.js";
import { EvalRunner } from "./eval.js";
import {
  appendIteration,
  createInitialState,
  createRunId,
  markCancelled,
  markFailed,
  markPassed,
  markRunning,
  saveRunState,
} from "./state.js";
import type {
  GoalContract,
  HostAdapter,
  OrchestratorResult,
  RunContext,
  SessionHandle,
} from "./types.js";

export interface OrchestratorOptions {
  contract: GoalContract;
  contractPath: string;
  adapter: HostAdapter;
  workspace: string;
  runsDir: string;
  runId?: string;
  /** Called after each state persist. */
  onState?: (result: OrchestratorResult["state"]) => void;
  /** Poll interval ms while session is running. */
  pollIntervalMs?: number;
  /** Max wait per iteration for session to leave running. */
  iterationTimeoutMs?: number;
  signal?: AbortSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("cancelled"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("cancelled"));
      },
      { once: true },
    );
  });
}

async function waitForIdle(
  adapter: HostAdapter,
  handle: SessionHandle,
  opts: { pollIntervalMs: number; timeoutMs: number; signal?: AbortSignal },
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (opts.signal?.aborted) throw new Error("cancelled");
    const snap = await adapter.poll(handle);
    switch (snap.status) {
      case "idle":
      case "exited":
        return;
      case "error":
        throw new Error(snap.error ?? "Agent session error");
      case "running":
        if (Date.now() - start > opts.timeoutMs) {
          throw new Error("timeout");
        }
        await sleep(opts.pollIntervalMs, opts.signal);
        break;
      default: {
        const _exhaustive: never = snap.status;
        throw new Error(`Unknown status: ${_exhaustive}`);
      }
    }
  }
}

/**
 * Shared outer loop: start/continue → poll → eval → continue until pass or max_iterations.
 * Stop ONLY on eval pass, max_iterations, or cancel — never on promise strings.
 */
export async function runOrchestrator(
  options: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const {
    contract,
    contractPath,
    adapter,
    workspace,
    runsDir,
    pollIntervalMs = 500,
    iterationTimeoutMs = 30 * 60 * 1000,
    signal,
  } = options;

  const runId = options.runId ?? createRunId();
  const runDir = join(runsDir, runId);
  mkdirSync(runDir, { recursive: true });

  if (existsSync(contractPath)) {
    copyFileSync(contractPath, join(runDir, "goal.yaml"));
  } else {
    writeFileSync(join(runDir, "goal.yaml"), JSON.stringify(contract, null, 2));
  }

  let state = createInitialState({
    runId,
    contractPath,
    host: adapter.id,
    workspace,
    maxIterations: contract.max_iterations,
  });
  state = markRunning(state);
  saveRunState(runsDir, state);
  options.onState?.(state);

  const startedAtMs = Date.parse(state.startedAt);
  const evalRunner = new EvalRunner({ workspace, startedAtMs });
  const ctx: RunContext = { runId, contract, workspace, runsDir };

  let handle: SessionHandle | undefined;

  try {
    // Pre-check: already done?
    const initial = evalRunner.run(contract);
    if (initial.pass) {
      state = appendIteration(state, {
        iteration: 0,
        evalPass: true,
        evalOutput: initial.output,
      });
      state = markPassed(state);
      saveRunState(runsDir, state);
      options.onState?.(state);
      return { state, passed: true };
    }

    handle = await adapter.start(ctx);
    await waitForIdle(adapter, handle, {
      pollIntervalMs,
      timeoutMs: iterationTimeoutMs,
      signal,
    });

    for (let iter = 1; iter <= contract.max_iterations; iter++) {
      if (signal?.aborted) throw new Error("cancelled");

      const evalResult = evalRunner.run(contract);
      state = appendIteration(state, {
        iteration: iter,
        evalPass: evalResult.pass,
        evalOutput: evalResult.output,
        failureReason: evalResult.pass ? undefined : "eval_fail",
      });
      saveRunState(runsDir, state);
      options.onState?.(state);

      if (evalResult.pass) {
        state = markPassed(state);
        saveRunState(runsDir, state);
        options.onState?.(state);
        return { state, passed: true };
      }

      if (iter >= contract.max_iterations) {
        state = markFailed(state, "max_iterations");
        saveRunState(runsDir, state);
        options.onState?.(state);
        return { state, passed: false };
      }

      const message = renderContinueMessage(contract, iter, evalResult.output);
      await adapter.continue(handle, {
        message,
        iteration: iter,
        evalOutput: evalResult.output,
      });
      await waitForIdle(adapter, handle, {
        pollIntervalMs,
        timeoutMs: iterationTimeoutMs,
        signal,
      });
    }

    state = markFailed(state, "max_iterations");
    saveRunState(runsDir, state);
    options.onState?.(state);
    return { state, passed: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "cancelled" || signal?.aborted) {
      if (handle) await adapter.cancel(handle).catch(() => undefined);
      state = markCancelled(state);
      saveRunState(runsDir, state);
      options.onState?.(state);
      return { state, passed: false };
    }
    if (msg === "timeout") {
      if (handle) await adapter.cancel(handle).catch(() => undefined);
      state = markFailed(state, "timeout");
      saveRunState(runsDir, state);
      options.onState?.(state);
      return { state, passed: false };
    }
    state = markFailed(state, "agent_error");
    state = appendIteration(state, {
      iteration: state.currentIteration + 1,
      evalPass: false,
      evalOutput: msg,
      failureReason: "agent_error",
    });
    saveRunState(runsDir, state);
    options.onState?.(state);
    return { state, passed: false };
  }
}
