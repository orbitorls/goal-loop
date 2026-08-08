import type { HostAdapter } from "@goal-loop/core";
import { createGenericShellAdapter } from "@goal-loop/adapter-generic-shell";

const shell = createGenericShellAdapter({
  command: "codex",
  args: ["exec", "{{prompt}}"],
});

/** Codex adapter — outerCli wrapper around generic-shell with codex exec defaults. */
export const codexAdapter: HostAdapter = {
  id: "codex",
  capabilities: { modes: ["outerCli"] },

  async start(ctx) {
    const enriched = {
      ...ctx,
      contract: {
        ...ctx.contract,
        command: ctx.contract.command ?? "codex",
        args: ctx.contract.args ?? ["exec", "{{prompt}}"],
      },
    };
    const handle = await shell.start(enriched);
    return { ...handle, adapterId: "codex" };
  },

  continue: shell.continue.bind(shell),
  poll: shell.poll.bind(shell),
  cancel: shell.cancel.bind(shell),
  collectEvidence: shell.collectEvidence?.bind(shell),
};

export function createCodexAdapter(): HostAdapter {
  return codexAdapter;
}
