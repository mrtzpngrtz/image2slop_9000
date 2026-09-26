$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$studioPython = Join-Path $studioRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $studioPython)) { $studioPython = (Get-Command python -ErrorAction Stop).Source }
$studioUrl = 'http://127.0.0.1:8765'
try {
    $studioResponse = Invoke-RestMethod -Uri "$studioUrl/api/bootstrap" -TimeoutSec 2
    if ($studioResponse.workflow.name -ne '360_subject.json') { throw 'Der Port wird von einem anderen Programm verwendet.' }
} catch {
    if (-not (Test-Path -LiteralPath (Join-Path $studioRoot 'web\dist\index.html'))) {
        throw 'Die Webapp muss zuerst eingerichtet werden: SETUP.cmd ausfuehren.'
    }
    New-Item -ItemType Directory -Path (Join-Path $studioRoot 'studio\data') -Force | Out-Null
    Start-Process -FilePath $studioPython -ArgumentList @('studio/server.py') -WorkingDirectory $studioRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $studioRoot 'studio\data\server.log') -RedirectStandardError (Join-Path $studioRoot 'studio\data\server-error.log')
    $studioReady = $false
    for ($studioAttempt = 0; $studioAttempt -lt 25; $studioAttempt++) {
        Start-Sleep -Milliseconds 400
        try { $null = Invoke-RestMethod -Uri "$studioUrl/api/bootstrap" -TimeoutSec 1; $studioReady = $true; break } catch {}
    }
    if (-not $studioReady) { throw 'Der Server konnte nicht starten. Siehe studio\data\server-error.log.' }
}
Start-Process $studioUrl
