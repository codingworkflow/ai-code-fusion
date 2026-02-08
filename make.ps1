#!/usr/bin/env pwsh
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CommandArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Remove-ProviderPrefix {
  param([string]$PathValue)

  if ($null -eq $PathValue) {
    return ''
  }

  return ($PathValue -replace '^Microsoft\.PowerShell\.Core\\FileSystem::', '')
}

function Quote-BashArg {
  param([string]$Value)

  if ($null -eq $Value -or $Value.Length -eq 0) {
    return "''"
  }

  return "'" + ($Value -replace "'", "'\"'\"'") + "'"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptRoot = Remove-ProviderPrefix $scriptRoot
$indexScript = Join-Path $scriptRoot 'scripts/index.js'

if (-not (Test-Path -LiteralPath $indexScript)) {
  Write-Error "Cannot find script entry point: $indexScript"
}

$uncPattern = '^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$'
$wslMatch = [regex]::Match($scriptRoot, $uncPattern)

if ($wslMatch.Success) {
  if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Error 'wsl.exe was not found. Install/enable WSL or run from a local Windows path.'
  }

  $distro = $wslMatch.Groups[1].Value
  $distroPath = $wslMatch.Groups[2].Value
  $linuxRoot = '/' + ($distroPath -replace '\\', '/')

  $bashCommandParts = @(
    'cd',
    (Quote-BashArg $linuxRoot),
    '&&',
    'node',
    'scripts/index.js'
  )

  foreach ($arg in $CommandArgs) {
    $bashCommandParts += (Quote-BashArg $arg)
  }

  $bashCommand = $bashCommandParts -join ' '
  & wsl.exe -d $distro -- bash -lc $bashCommand
  $exitCode = $LASTEXITCODE
} else {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js is required but was not found in PATH.'
  }

  Push-Location -LiteralPath $scriptRoot
  try {
    & node $indexScript @CommandArgs
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
}

if ($null -eq $exitCode) {
  $exitCode = 0
}

exit $exitCode
