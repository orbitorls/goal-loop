# Smoke demo: proof-file eval + generic-shell writes PROOF.txt
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (Test-Path PROOF.txt) { Remove-Item PROOF.txt }

Write-Host "Running local-eval-demo..."
npx goal-loop run --host generic-shell --goal goal.yaml --workspace .

if (-not (Test-Path PROOF.txt)) {
  Write-Error "Expected PROOF.txt after run"
}
$content = Get-Content PROOF.txt -Raw
if ($content -notmatch "DONE") {
  Write-Error "PROOF.txt does not contain DONE"
}
Write-Host "Demo OK: PROOF.txt contains DONE"
