import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContract, validateContract } from "./contract.js";
import { EvalRunner } from "./eval.js";

describe("validateContract", () => {
  it("accepts a valid command eval contract", () => {
    const c = validateContract({
      goal: "Make tests pass",
      acceptance: "npm test exits 0",
      eval: { kind: "command", command: "npm test" },
      max_iterations: 5,
      host: "generic-shell",
    });
    expect(c.max_iterations).toBe(5);
    expect(c.eval.kind).toBe("command");
  });

  it("rejects missing max_iterations", () => {
    expect(() =>
      validateContract({
        goal: "x",
        acceptance: "y",
        eval: { kind: "command", command: "true" },
      }),
    ).toThrow();
  });

  it("rejects zero max_iterations", () => {
    expect(() =>
      validateContract({
        goal: "x",
        acceptance: "y",
        eval: { kind: "command", command: "true" },
        max_iterations: 0,
      }),
    ).toThrow();
  });

  it("loads YAML from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-loop-"));
    const path = join(dir, "goal.yaml");
    writeFileSync(
      path,
      `
goal: Demo
acceptance: proof exists
eval:
  kind: proof-file
  path: PROOF.txt
  contains: DONE
max_iterations: 3
`,
      "utf8",
    );
    const c = loadContract(path);
    expect(c.goal).toBe("Demo");
    expect(c.eval.kind).toBe("proof-file");
  });
});

describe("EvalRunner", () => {
  it("passes command eval when exit code is 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-loop-"));
    const runner = new EvalRunner({ workspace: dir });
    const result = runner.run({
      goal: "ok",
      acceptance: "ok",
      eval: { kind: "command", command: "node -e \"process.exit(0)\"" },
      max_iterations: 1,
    });
    expect(result.pass).toBe(true);
  });

  it("fails command eval on non-zero exit", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-loop-"));
    const runner = new EvalRunner({ workspace: dir });
    const result = runner.run({
      goal: "ok",
      acceptance: "ok",
      eval: { kind: "command", command: "node -e \"process.exit(1)\"" },
      max_iterations: 1,
    });
    expect(result.pass).toBe(false);
  });

  it("passes proof-file when content matches", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-loop-"));
    writeFileSync(join(dir, "PROOF.txt"), "DONE\n", "utf8");
    const runner = new EvalRunner({ workspace: dir });
    const result = runner.run({
      goal: "ok",
      acceptance: "ok",
      eval: { kind: "proof-file", path: "PROOF.txt", contains: "DONE" },
      max_iterations: 1,
    });
    expect(result.pass).toBe(true);
  });

  it("fails when proof is stale relative to startedAt", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-loop-"));
    const proof = join(dir, "PROOF.txt");
    writeFileSync(proof, "claim", "utf8");
    // Make proof look old
    const old = new Date(Date.now() - 60_000);
    utimesSync(proof, old, old);

    const runner = new EvalRunner({
      workspace: dir,
      startedAtMs: Date.now(),
    });
    const result = runner.run({
      goal: "ok",
      acceptance: "ok",
      eval: { kind: "command", command: "node -e \"process.exit(0)\"" },
      proof: { path: "PROOF.txt" },
      max_iterations: 1,
    });
    expect(result.pass).toBe(false);
    expect(result.proofFresh).toBe(false);
  });

  it("passes when proof is fresh", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-loop-"));
    const startedAtMs = Date.now() - 5_000;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "PROOF.txt"), "claim", "utf8");

    const runner = new EvalRunner({ workspace: dir, startedAtMs });
    const result = runner.run({
      goal: "ok",
      acceptance: "ok",
      eval: { kind: "command", command: "node -e \"process.exit(0)\"" },
      proof: { path: "PROOF.txt" },
      max_iterations: 1,
    });
    expect(result.pass).toBe(true);
    expect(result.proofFresh).toBe(true);
  });
});
