import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export type SkillTarget = "cursor" | "claude";

export interface InstallSkillOptions {
  workspace: string;
  targets: SkillTarget[];
  global?: boolean;
}

function listSkillSourceCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "..", "skills", "goal-loop"),
    join(here, "..", "..", "..", "skills", "goal-loop"),
    join(here, "..", "..", "..", "plugins", "goal-loop", "skills", "goal-loop"),
  ];
}

export function resolveSkillSourceDir(): string {
  for (const candidate of listSkillSourceCandidates()) {
    if (existsSync(join(candidate, "SKILL.md"))) {
      return candidate;
    }
  }
  throw new Error(
    "Goal Loop skill source not found. Clone the repo or reinstall @goal-loop/cli.",
  );
}

function skillDestDir(
  workspace: string,
  target: SkillTarget,
  global: boolean,
): string {
  const base =
    target === "cursor"
      ? global
        ? join(homedir(), ".cursor", "skills")
        : join(workspace, ".cursor", "skills")
      : global
        ? join(homedir(), ".claude", "skills")
        : join(workspace, ".claude", "skills");
  return join(base, "goal-loop");
}

function copySkillDir(sourceDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const from = join(sourceDir, entry.name);
    const to = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copySkillDir(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

export function installSkill(options: InstallSkillOptions): string[] {
  const sourceDir = resolveSkillSourceDir();
  const installed: string[] = [];

  for (const target of options.targets) {
    const destDir = skillDestDir(options.workspace, target, options.global ?? false);
    copySkillDir(sourceDir, destDir);
    installed.push(destDir);
  }

  return installed;
}
