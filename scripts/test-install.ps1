# Runs public/install.ps1 against a fake release on 127.0.0.1, in Windows
# PowerShell and in PowerShell 7, through Invoke-Expression as irm | iex does.
# Checks that it installs only a download it could verify. Touches nothing
# outside a temp directory and talks to nothing but loopback.
#
# Windows only: the fake binary is compiled with the .NET Framework's csc.exe,
# and the locked-exe case depends on Windows refusing to delete a running exe.
# Needs python on PATH. Run it with: powershell -File scripts\test-install.ps1
$ErrorActionPreference = "Stop"
$installer = (Resolve-Path (Join-Path $PSScriptRoot "..\public\install.ps1")).Path
$asset = "bitllm-windows-amd64.exe"
$work = Join-Path ([IO.Path]::GetTempPath()) ("bitllm-test-" + [guid]::NewGuid().ToString("N"))
$www = Join-Path $work "www"
New-Item -ItemType Directory -Path $www | Out-Null
$newExe = Join-Path $work "new.exe"
$oldExe = Join-Path $work "old.exe"
$newRan = Join-Path $work "new-ran"
$oldRan = Join-Path $work "old-ran"
$runner = Join-Path $work "run.ps1"
$failures = 0

function Check($ok, $what) {
  if ($ok) { Write-Host "ok    $what" } else { Write-Host "FAIL  $what"; $script:failures++ }
}

# A real exe: it leaves a mark on --version and otherwise sleeps, so it can play
# a running node.
function New-FakeExe($path, $version, $marker) {
  $source = "$path.cs"
  Set-Content -LiteralPath $source -Value @"
class P {
  static void Main(string[] a) {
    if (a.Length > 0 && a[0] == "--version") {
      System.IO.File.AppendAllText(@"$marker", "ran");
      System.Console.WriteLine("bitllm $version");
    } else {
      System.Threading.Thread.Sleep(120000);
    }
  }
}
"@
  $csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  & $csc /nologo "/out:$path" $source | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "test-install: csc failed" }
}

function Get-Sha256($path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower() }

# With $null for the text, the release has no SHA256SUMS at all.
function New-Release($name, $sumsText) {
  $d = Join-Path $www $name
  New-Item -ItemType Directory -Path $d | Out-Null
  Copy-Item -LiteralPath $newExe -Destination (Join-Path $d $asset)
  if ($null -ne $sumsText) { [IO.File]::WriteAllText((Join-Path $d "SHA256SUMS"), $sumsText) }
}

# A fresh %LOCALAPPDATA%, with or without an existing install.
function New-Case($shell, $case, $withOld) {
  foreach ($mark in $newRan, $oldRan) { Remove-Item -Force -LiteralPath $mark -ErrorAction SilentlyContinue }
  $appData = Join-Path $work "$shell-$case"
  $dir = Join-Path $appData "bitllm"
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  if ($withOld) { Copy-Item -LiteralPath $oldExe -Destination (Join-Path $dir "bitllm.exe") }
  $appData
}

function Get-Names($appData) {
  (Get-ChildItem -Force -LiteralPath (Join-Path $appData "bitllm") | ForEach-Object { $_.Name }) -join ","
}

# The returned text has no whitespace: a shell wraps long error lines when its
# output is redirected.
function Invoke-Installer($shell, $release, $appData) {
  $env:LOCALAPPDATA = $appData
  $env:BITLLM_BASE = "$server/$release"
  $ErrorActionPreference = "Continue"
  $text = & $shell -NoProfile -ExecutionPolicy Bypass -File $runner 2>&1 | Out-String
  @{ Code = $LASTEXITCODE; Text = ($text -replace '\s', '') }
}

function Test-Said($result, $words) { $result.Text.Contains(($words -replace '\s', '')) }

function Test-Installed($shell, $case, $appData, $result) {
  $exe = Join-Path $appData "bitllm\bitllm.exe"
  Check ($result.Code -eq 0) "$shell ${case}: exits 0"
  Check ((Get-Sha256 $exe) -eq $newHash) "$shell ${case}: installs the new binary"
  Check ((Get-Names $appData) -eq "bitllm.exe") "$shell ${case}: leaves no temp files"
  foreach ($line in "downloading $asset", "checksum ok", "bitllm v9.9.9-new", "Installed $exe", "Start it with:") {
    Check (Test-Said $result $line) "$shell ${case}: prints '$line'"
  }
}

function Test-Refused($shell, $case, $appData, $result, $words, $withOld) {
  Check ($result.Code -ne 0) "$shell ${case}: exits non-zero"
  Check (Test-Said $result $words) "$shell ${case}: says '$words'"
  Check (-not (Test-Path -LiteralPath $newRan)) "$shell ${case}: runs nothing new"
  Check (-not (Test-Path -LiteralPath $oldRan)) "$shell ${case}: runs nothing old"
  if ($withOld) {
    Check ((Get-Sha256 (Join-Path $appData "bitllm\bitllm.exe")) -eq $oldHash) "$shell ${case}: leaves the existing exe unchanged"
    Check ((Get-Names $appData) -eq "bitllm.exe") "$shell ${case}: leaves nothing else behind"
  } else {
    Check ((Get-Names $appData) -eq "") "$shell ${case}: installs nothing"
  }
}

$serverProcess = $null
try {
  New-FakeExe $newExe "v9.9.9-new" $newRan
  New-FakeExe $oldExe "v0.0.1-old" $oldRan
  $newHash = Get-Sha256 $newExe
  $oldHash = Get-Sha256 $oldExe
  New-Release "good" "$newHash  $asset`n"
  New-Release "nosums" $null
  New-Release "noentry" "$newHash  $asset.sig`n"
  New-Release "mismatch" "$oldHash  $asset`n"
  Set-Content -LiteralPath $runner -Value "Get-Content -Raw -LiteralPath '$installer' | Invoke-Expression"

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = $listener.LocalEndpoint.Port
  $listener.Stop()
  $serverProcess = Start-Process -PassThru -WindowStyle Hidden -FilePath python -ArgumentList "-m", "http.server", "$port", "--bind", "127.0.0.1", "--directory", $www
  $server = "http://127.0.0.1:$port"
  $up = $false
  for ($i = 0; $i -lt 50 -and -not $up; $i++) {
    try { Invoke-WebRequest -UseBasicParsing "$server/" | Out-Null; $up = $true } catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $up) { throw "test-install: the fake release server did not start" }

  foreach ($shell in "powershell", "pwsh") {
    $appData = New-Case $shell "good-fresh" $false
    Test-Installed $shell "good-fresh" $appData (Invoke-Installer $shell "good" $appData)

    $appData = New-Case $shell "good-over-existing" $true
    Test-Installed $shell "good-over-existing" $appData (Invoke-Installer $shell "good" $appData)

    $refusals = @(
      @("missing-sums", "nosums", "could not download SHA256SUMS"),
      @("no-entry", "noentry", "SHA256SUMS has no entry for $asset"),
      @("mismatch", "mismatch", "checksum mismatch for $asset")
    )
    foreach ($r in $refusals) {
      foreach ($withOld in $true, $false) {
        $case = "$($r[0])-$(if ($withOld) { 'existing' } else { 'fresh' })"
        $appData = New-Case $shell $case $withOld
        Test-Refused $shell $case $appData (Invoke-Installer $shell $r[1] $appData) $r[2] $withOld
      }
    }

    $appData = New-Case $shell "locked" $true
    $node = Start-Process -PassThru -WindowStyle Hidden -FilePath (Join-Path $appData "bitllm\bitllm.exe")
    try {
      Start-Sleep -Seconds 1
      Test-Refused $shell "locked" $appData (Invoke-Installer $shell "good" $appData) "a running node has it locked" $true
    } finally {
      Stop-Process -Id $node.Id -Force
    }
  }
} finally {
  if ($serverProcess) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue
}

if ($failures -ne 0) {
  Write-Host "test-install: $failures failed"
  exit 1
}
Write-Host "test-install: ok"
# The last native command was an installer run that failed on purpose. Without
# this, a CI step would exit with its code.
exit 0
