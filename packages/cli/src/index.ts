#!/usr/bin/env node
import { Command } from "commander";
import {
  runCommand,
  statusCommand,
  cancelCommand,
  initCommand,
  doctorCommand,
} from "./commands.js";

const program = new Command();

program
  .name("goal-loop")
  .description("Harness-agnostic goal loop with eval-gated stop")
  .version("0.1.0");

program
  .command("run")
  .description("Run the goal loop orchestrator")
  .requiredOption("--goal <path>", "Path to goal.yaml contract")
  .option("--host <id>", "Host adapter id or auto", "auto")
  .option("--workspace <path>", "Workspace directory", process.cwd())
  .option("--runs-dir <path>", "Directory for run state (default: .goal-loop/runs)")
  .option(
    "--command <parts...>",
    "Override contract command (first token is executable, rest are args)",
  )
  .action(
    async (opts: {
      host: string;
      goal: string;
      workspace: string;
      runsDir?: string;
      command?: string[];
    }) => {
      await runCommand(opts);
    },
  );

program
  .command("status")
  .description("Show run status")
  .argument("[runId]", "Run id (default: latest)")
  .option("--workspace <path>", "Workspace directory", process.cwd())
  .option("--runs-dir <path>", "Runs directory override")
  .action(
    (runId: string | undefined, opts: { workspace: string; runsDir?: string }) => {
      statusCommand(opts.workspace, runId, opts.runsDir);
    },
  );

program
  .command("cancel")
  .description("Cancel an active run")
  .argument("[runId]", "Run id (default: latest)")
  .option("--workspace <path>", "Workspace directory", process.cwd())
  .option("--runs-dir <path>", "Runs directory override")
  .action(
    async (runId: string | undefined, opts: { workspace: string; runsDir?: string }) => {
      await cancelCommand(opts.workspace, runId, opts.runsDir);
    },
  );

program
  .command("init")
  .description("Install hook templates or agent skill for a host")
  .requiredOption("--host <id>", "Host adapter id (e.g. cursor-ide, claude-code, skill)")
  .option("--workspace <path>", "Workspace directory", process.cwd())
  .option("--global", "Install skill to user home (~/.cursor or ~/.claude)")
  .action((opts: { host: string; workspace: string; global?: boolean }) => {
    initCommand(opts.host, opts.workspace, { global: opts.global });
  });

program
  .command("doctor")
  .description("Check capability matrix and environment")
  .action(() => {
    doctorCommand();
  });

program.parse();
