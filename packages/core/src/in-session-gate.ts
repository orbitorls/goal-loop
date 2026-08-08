import { EvalRunner } from "./eval.js";
import type { EvalResult, GoalContract } from "./types.js";

/**
 * In-session gate used by stop hooks (Cursor IDE, Claude Code).
 * Returns whether the agent may stop, and an optional follow-up message.
 */
export interface GateDecision {
  allowStop: boolean;
  followupMessage?: string;
  eval: EvalResult;
  iteration: number;
  maxIterations: number;
}

export interface InSessionGateOptions {
  contract: GoalContract;
  workspace: string;
  iteration: number;
  startedAtMs?: number;
  onContinueTemplate?: string;
}

export function evaluateInSessionGate(
  options: InSessionGateOptions,
): GateDecision {
  const { contract, workspace, iteration } = options;
  const runner = new EvalRunner({
    workspace,
    startedAtMs: options.startedAtMs,
  });
  const evalResult = runner.run(contract);

  if (evalResult.pass) {
    return {
      allowStop: true,
      eval: evalResult,
      iteration,
      maxIterations: contract.max_iterations,
    };
  }

  if (iteration >= contract.max_iterations) {
    return {
      allowStop: true,
      eval: evalResult,
      iteration,
      maxIterations: contract.max_iterations,
      followupMessage: undefined,
    };
  }

  const template =
    options.onContinueTemplate ??
    contract.on_continue ??
    `Eval failed (iteration {{iteration}}/{{max}}). Do not stop. Continue working.\n\nGoal: {{goal}}\nAcceptance: {{acceptance}}\n\nEval output:\n{{eval_output}}`;

  const followupMessage = template
    .replaceAll("{{iteration}}", String(iteration))
    .replaceAll("{{max}}", String(contract.max_iterations))
    .replaceAll("{{goal}}", contract.goal)
    .replaceAll("{{acceptance}}", contract.acceptance)
    .replaceAll("{{eval_output}}", evalResult.output);

  return {
    allowStop: false,
    followupMessage,
    eval: evalResult,
    iteration,
    maxIterations: contract.max_iterations,
  };
}
