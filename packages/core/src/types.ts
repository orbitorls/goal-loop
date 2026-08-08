/** Host capability flags — adapters declare what they support. */
export type HostCapability =
  | "inSessionGate"
  | "outerApi"
  | "outerCli"
  | "proofOnly";

export interface HostCapabilities {
  modes: HostCapability[];
}

/** Eval strategy kinds in the goal contract. */
export type EvalKind = "command" | "git-checks" | "proof-file";

export interface EvalCommand {
  kind: "command";
  command: string;
  cwd?: string;
}

export interface EvalGitChecks {
  kind: "git-checks";
  branch?: string;
  checks?: string[];
}

export interface EvalProofFile {
  kind: "proof-file";
  path: string;
  contains?: string;
}

export type EvalSpec = EvalCommand | EvalGitChecks | EvalProofFile;

export interface ProofSpec {
  path?: string;
  description?: string;
}

export interface GoalContract {
  goal: string;
  acceptance: string;
  eval: EvalSpec;
  proof?: ProofSpec;
  max_iterations: number;
  host?: string;
  workspace?: string;
  on_continue?: string;
  /** generic-shell / CLI adapter extras */
  command?: string;
  args?: string[];
}

export type SessionStatus = "running" | "idle" | "exited" | "error";

export interface SessionHandle {
  id: string;
  adapterId: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSnapshot {
  status: SessionStatus;
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface ContinuePayload {
  message: string;
  iteration: number;
  evalOutput?: string;
}

export interface RunContext {
  runId: string;
  contract: GoalContract;
  workspace: string;
  runsDir: string;
}

export interface Evidence {
  branch?: string;
  prUrl?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
}

export type FailureReason =
  | "eval_fail"
  | "agent_error"
  | "timeout"
  | "cancelled"
  | "max_iterations";

export interface IterationLogEntry {
  iteration: number;
  timestamp: string;
  evalPass: boolean;
  evalOutput: string;
  failureReason?: FailureReason;
  sessionStatus?: SessionStatus;
}

export interface RunState {
  runId: string;
  contractPath: string;
  host: string;
  workspace: string;
  status: "pending" | "running" | "passed" | "failed" | "cancelled";
  currentIteration: number;
  maxIterations: number;
  iterations: IterationLogEntry[];
  startedAt: string;
  updatedAt: string;
  failureReason?: FailureReason;
}

export interface EvalResult {
  pass: boolean;
  output: string;
  proofFresh: boolean;
}

export interface HostAdapter {
  id: string;
  capabilities: HostCapabilities;
  start(ctx: RunContext): Promise<SessionHandle>;
  continue(handle: SessionHandle, delta: ContinuePayload): Promise<void>;
  poll(handle: SessionHandle): Promise<SessionSnapshot>;
  cancel(handle: SessionHandle): Promise<void>;
  collectEvidence?(handle: SessionHandle): Promise<Evidence>;
}

export interface OrchestratorResult {
  state: RunState;
  passed: boolean;
}
