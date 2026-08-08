# Local Eval Demo

Eval-gated loop using `proof-file` eval. No external agent harness — `generic-shell` runs a one-line Node script that creates `PROOF.txt`.

## Prerequisites

From repo root: `npm install` and `npm run build`.

## Run (manual)

```powershell
cd examples/local-eval-demo
Remove-Item PROOF.txt -ErrorAction SilentlyContinue
npx goal-loop run --host generic-shell --goal goal.yaml --workspace .
```

## Run (smoke script)

```powershell
cd examples/local-eval-demo
.\run-demo.ps1
```

## Expected flow

1. Orchestrator starts; pre-check eval fails (no `PROOF.txt`).
2. `generic-shell` runs `node -e` to write `PROOF.txt` with `DONE`.
3. Eval passes; loop stops after 1 iteration.

## Expected output

```
Run id: ...
Host: generic-shell
...
✓ Goal loop passed after 1 iteration(s)
```

`PROOF.txt` remains in this directory with content `DONE`.
