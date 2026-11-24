$ErrorActionPreference = 'Stop'
$nodeExecutable = Get-Command node.exe -ErrorAction Stop
$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
& $nodeExecutable.Source -e 'if (Number(process.versions.node.split(".")[0]) < 20) { console.error("Node.js 20+ is required"); process.exit(1); }'
if ($LASTEXITCODE -ne 0) { throw 'Upgrade Node.js before installing.' }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Install Claude Code first.' }
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ('claude-ab-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$archive = $null
try {
    $archiveName = & $npmExecutable pack $PSScriptRoot --pack-destination $temporaryDirectory --silent --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Could not package the launcher.' }
    $archive = Join-Path $temporaryDirectory ([IO.Path]::GetFileName(($archiveName | Select-Object -Last 1)))
    & $npmExecutable install --global $archive --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Global installation failed. Check your npm user prefix permissions.' }
    Write-Host 'Installed claude-ab. Next: claude-ab --setup'
} finally {
    if ($archive -and (Test-Path -LiteralPath $archive)) { Remove-Item -LiteralPath $archive -Force }
    Remove-Item -LiteralPath $temporaryDirectory -ErrorAction SilentlyContinue
}
