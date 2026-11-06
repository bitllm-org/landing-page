# BitLLM installer for Windows (PowerShell). Downloads the latest release
# binary, checks it against the release's SHA256SUMS, and only then puts
# bitllm.exe in %LOCALAPPDATA%\bitllm. If the check cannot be done, nothing is
# installed. No admin rights needed.
#
# BITLLM_BASE overrides where the release files come from. The tests in
# scripts/test-install.ps1 point it at a local server.
#
#   irm https://bitllm.org/install.ps1 | iex
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:LOCALAPPDATA "bitllm"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$exe = Join-Path $dir "bitllm.exe"
$name = "bitllm-windows-amd64.exe"
$base = if ($env:BITLLM_BASE) { $env:BITLLM_BASE } else { "https://github.com/bitllm-org/bitllm/releases/latest/download" }
# Failures use throw, not exit: under irm | iex, exit would close the user's
# window. A throw still gives a script or CI step a non-zero exit code.
# Downloads go beside the final path, so the move stays on one volume.
$stage = Join-Path $dir (".install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  $new = Join-Path $stage $name
  $sumsFile = Join-Path $stage "SHA256SUMS"
  Write-Host "downloading $name"
  Invoke-WebRequest -UseBasicParsing -OutFile $new "$base/$name"
  # Saved to a file: release assets are octet-stream, which PowerShell 5.1 returns as bytes.
  try { Invoke-WebRequest -UseBasicParsing -OutFile $sumsFile "$base/SHA256SUMS" }
  catch { throw "bitllm: could not download SHA256SUMS from $base, not installing" }
  $want = Get-Content -LiteralPath $sumsFile | ForEach-Object {
    $fields = -split $_
    if ($fields.Count -ge 2 -and $fields[1].TrimStart("*") -eq $name) { $fields[0] }
  } | Select-Object -First 1
  if (-not $want) { throw "bitllm: SHA256SUMS has no entry for $name, not installing" }
  $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $new).Hash.ToLower()
  if ($want -ne $got) { throw "bitllm: checksum mismatch for $name, not installing" }
  Write-Host "checksum ok"
  try { Move-Item -Force -LiteralPath $new -Destination $exe }
  catch { throw "bitllm: could not replace $exe, most likely because a running node has it locked. Stop the node and run this again. ($($_.Exception.Message))" }
} finally {
  Remove-Item -Recurse -Force -LiteralPath $stage -ErrorAction SilentlyContinue
}
& $exe --version
Write-Host ""
Write-Host "Installed $exe"
Write-Host "Start it with:  & '$exe'"
Write-Host "Then open http://127.0.0.1:7778, or read https://bitllm.org/llms.txt (steps for agents)."
