import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { GoalContract } from "./types.js";

const EvalCommandSchema = z.object({
  kind: z.literal("command"),
  command: z.string().min(1),
  cwd: z.string().optional(),
});

const EvalGitChecksSchema = z.object({
  kind: z.literal("git-checks"),
  branch: z.string().optional(),
  checks: z.array(z.string()).optional(),
});

const EvalProofFileSchema = z.object({
  kind: z.literal("proof-file"),
  path: z.string().min(1),
  contains: z.string().optional(),
});

const EvalSpecSchema = z.discriminatedUnion("kind", [
  EvalCommandSchema,
  EvalGitChecksSchema,
  EvalProofFileSchema,
]);

const ProofSpecSchema = z
  .object({
    path: z.string().optional(),
    description: z.string().optional(),
  })
  .optional();

export const GoalContractSchema = z.object({
  goal: z.string().min(1),
  acceptance: z.string().min(1),
  eval: EvalSpecSchema,
  proof: ProofSpecSchema,
  max_iterations: z.number().int().positive(),
  host: z.string().optional(),
  workspace: z.string().optional(),
  on_continue: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export type GoalContractInput = z.infer<typeof GoalContractSchema>;

export function validateContract(raw: unknown): GoalContract {
  const parsed = GoalContractSchema.parse(raw);
  return parsed as GoalContract;
}

export function loadContract(path: string): GoalContract {
  const text = readFileSync(path, "utf8");
  const raw = parseYaml(text);
  return validateContract(raw);
}

export function renderContinueMessage(
  contract: GoalContract,
  iteration: number,
  evalOutput: string,
): string {
  const template =
    contract.on_continue ??
    `Eval failed on iteration {{iteration}}. Fix remaining gaps and continue toward the goal.\n\nGoal: {{goal}}\nAcceptance: {{acceptance}}\n\nEval output:\n{{eval_output}}`;

  return template
    .replaceAll("{{iteration}}", String(iteration))
    .replaceAll("{{goal}}", contract.goal)
    .replaceAll("{{acceptance}}", contract.acceptance)
    .replaceAll("{{eval_output}}", evalOutput);
}
