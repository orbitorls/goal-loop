#!/usr/bin/env node
/**
 * Bundle CLI + core + adapters into a single npx-friendly binary.
 * Output: packages/goal-loop/bin/goal-loop.mjs (+ skills/plugins copies)
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "npm-package");
const binDir = join(outDir, "bin");
const outBin = join(binDir, "goal-loop.js");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runNpm(args) {
  run(process.platform === "win32" ? "npm.cmd" : "npm", args, { shell: true });
}

// Ensure workspace packages are built (for typecheck/source resolution)
for (const ws of [
  "@goal-loop/core",
  "@goal-loop/adapter-generic-shell",
  "@goal-loop/adapter-cursor-ide",
  "@goal-loop/adapter-claude-code",
  "@goal-loop/adapter-cursor-cloud",
  "@goal-loop/adapter-devin",
  "@goal-loop/adapter-codex",
  "@goal-loop/cli",
]) {
  runNpm(["run", "build", "-w", ws]);
}

mkdirSync(binDir, { recursive: true });

const entry = join(root, "packages", "cli", "src", "index.ts");
const esbuildBin = require.resolve("esbuild/bin/esbuild");
run(process.execPath, [
  esbuildBin,
  entry,
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--target=node20",
  `--outfile=${outBin}`,
  "--packages=bundle",
]);

// Ship skill + plugin assets next to the binary package
for (const name of ["skills", "plugins"]) {
  const dest = join(outDir, name);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(join(root, name), dest, { recursive: true });
}

const pkg = {
  name: "goal-loop-cli",
  version: "0.1.0",
  description:
    "Harness-agnostic goal loop with eval-gated stop — npx goal-loop-cli",
  bin: {
    "goal-loop": "bin/goal-loop.js",
    "goal-loop-cli": "bin/goal-loop.js",
  },
  files: ["bin", "skills", "plugins", "README.md"],
  engines: {
    node: ">=20",
  },
  repository: {
    type: "git",
    url: "git+https://github.com/orbitorls/goal-loop.git",
  },
  bugs: {
    url: "https://github.com/orbitorls/goal-loop/issues",
  },
  homepage: "https://github.com/orbitorls/goal-loop#readme",
  keywords: [
    "goal-loop",
    "agents",
    "cursor",
    "claude-code",
    "eval",
    "skill",
    "cli",
  ],
  license: "MIT",
  publishConfig: {
    access: "public",
  },
};

writeFileSync(join(outDir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

const readme = `# goal-loop-cli

\`\`\`bash
npx goal-loop-cli doctor
npx goal-loop-cli init
npx goal-loop-cli run --host generic-shell --goal goal.yaml
\`\`\`

Binary name is also \`goal-loop\` after install: \`npm i -g goal-loop-cli && goal-loop doctor\`

See https://github.com/orbitorls/goal-loop
`;
writeFileSync(join(outDir, "README.md"), readme);

const built = readFileSync(outBin, "utf8");
if (!built.startsWith("#!/usr/bin/env node")) {
  writeFileSync(outBin, "#!/usr/bin/env node\n" + built);
}

console.log(`Bundled: ${outBin}`);
