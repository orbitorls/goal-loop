# Adapter Smoke Test

Minimal `generic-shell` run using Node (Windows-friendly). Harness writes `smoke.marker`; eval reads it via a separate `node -e` command.

## Run

```powershell
cd examples/adapter-smoke
npx goal-loop run --host generic-shell --goal goal.yaml --workspace .
```

## Also useful

```powershell
npx goal-loop doctor
npx goal-loop status --workspace .
```

## Expected output

```
✓ Goal loop passed after 1 iteration(s)
```

Harness writes `smoke.marker` and prints `goal-loop smoke`; eval reads the marker and prints `smoke-ok`.
