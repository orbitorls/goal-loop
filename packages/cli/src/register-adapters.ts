import { registerAdapter } from "@goal-loop/core";
import { genericShellAdapter } from "@goal-loop/adapter-generic-shell";
import { cursorIdeAdapter } from "@goal-loop/adapter-cursor-ide";
import { claudeCodeAdapter } from "@goal-loop/adapter-claude-code";
import { cursorCloudAdapter } from "@goal-loop/adapter-cursor-cloud";
import { devinAdapter } from "@goal-loop/adapter-devin";
import { codexAdapter } from "@goal-loop/adapter-codex";

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;

  const adapters = [
    genericShellAdapter,
    cursorIdeAdapter,
    claudeCodeAdapter,
    cursorCloudAdapter,
    devinAdapter,
    codexAdapter,
  ];

  for (const adapter of adapters) {
    registerAdapter(adapter);
  }

  registered = true;
}
