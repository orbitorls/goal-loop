export type {
  HostCapability,
  HostCapabilities,
  EvalKind,
  EvalCommand,
  EvalGitChecks,
  EvalProofFile,
  EvalSpec,
  ProofSpec,
  GoalContract,
  SessionStatus,
  SessionHandle,
  SessionSnapshot,
  ContinuePayload,
  RunContext,
  Evidence,
  FailureReason,
  IterationLogEntry,
  RunState,
  EvalResult,
  HostAdapter,
  OrchestratorResult,
} from "./types.js";

export {
  GoalContractSchema,
  validateContract,
  loadContract,
  renderContinueMessage,
} from "./contract.js";
export type { GoalContractInput } from "./contract.js";

export { EvalRunner } from "./eval.js";
export type { EvalRunnerOptions } from "./eval.js";

export {
  createRunId,
  createInitialState,
  runStatePath,
  saveRunState,
  loadRunState,
  findLatestRunId,
  appendIteration,
  markRunning,
  markPassed,
  markFailed,
  markCancelled,
  failureFromSession,
} from "./state.js";

export {
  registerAdapter,
  listAdapters,
  getAdapter,
  resolveHost,
  clearRegistry,
} from "./registry.js";

export { runOrchestrator } from "./orchestrator.js";
export type { OrchestratorOptions } from "./orchestrator.js";

export { evaluateInSessionGate } from "./in-session-gate.js";
export type { GateDecision, InSessionGateOptions } from "./in-session-gate.js";

export { runRemoteEval } from "./remote-eval.js";
export type { RemoteEvalStrategy, RemoteEvalOptions } from "./remote-eval.js";
