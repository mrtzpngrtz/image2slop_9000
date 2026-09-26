param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$studioPython = Join-Path $studioRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $studioPython)) {
    & $Python -m venv (Join-Path $studioRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11, then run SETUP.cmd again.' }
}
$env:PIP_CONFIG_FILE = 'NUL'
Remove-Item Env:PIP_EXTRA_INDEX_URL -ErrorAction SilentlyContinue
& $studioPython -m pip install --index-url https://pypi.org/simple -r (Join-Path $studioRoot 'studio\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
$studioConfig = Join-Path $studioRoot 'pipeline.json'
if (-not (Test-Path -LiteralPath $studioConfig)) {
    $studioDefaults = Get-Content -Raw (Join-Path $studioRoot 'pipeline.example.json') | ConvertFrom-Json
    foreach ($studioTool in @('ffmpeg', 'ffprobe', 'colmap', 'brush')) {
        $studioCommand = Get-Command "$studioTool.exe" -ErrorAction SilentlyContinue
        if ($studioCommand) { $studioDefaults.$studioTool = $studioCommand.Source.Replace('\', '/') }
    }
    [System.IO.File]::WriteAllText($studioConfig, ($studioDefaults | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
}
New-Item -ItemType Directory -Path (Join-Path $studioRoot 'studio\data') -Force | Out-Null
Push-Location (Join-Path $studioRoot 'web')
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Install Node.js 22.12 or newer, then run SETUP.cmd again.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Webapp build failed.' }
} finally { Pop-Location }
Write-Host 'Ready. Check tool paths in pipeline.json. Run START-WEBAPP.cmd.'
