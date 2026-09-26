$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot 'tools\sam3-env'
$cachePath = Join-Path $projectRoot 'tools\sam3-cache'
$tempPath = Join-Path $cachePath 'tmp'
New-Item -ItemType Directory -Path $cachePath,$tempPath -Force | Out-Null
$env:TEMP = $tempPath
$env:TMP = $tempPath
$env:PIP_CACHE_DIR = Join-Path $cachePath 'pip'
$env:PIP_CONFIG_FILE = 'NUL'
Remove-Item Env:PIP_EXTRA_INDEX_URL -ErrorAction SilentlyContinue
$env:HF_HUB_CACHE = Join-Path $cachePath 'huggingface\hub'
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
$python = Join-Path $environmentPath 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    $sam3BasePython = Join-Path $projectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $sam3BasePython)) { $sam3BasePython = (Get-Command python -ErrorAction Stop).Source }
    & $sam3BasePython -m venv $environmentPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the SAM3 environment.' }
}
& $python -m pip install --upgrade pip --index-url https://pypi.org/simple
if ($LASTEXITCODE -ne 0) { throw 'Could not install pip.' }
& $python -m pip install torch==2.10.0 torchvision==0.25.0 --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE -ne 0) { throw 'Could not install CUDA PyTorch.' }
& $python -m pip install transformers==5.17.0 pillow numpy --index-url https://pypi.org/simple
if ($LASTEXITCODE -ne 0) { throw 'Could not install SAM3 dependencies.' }
& $python -m pip check
if ($LASTEXITCODE -ne 0) { throw 'SAM3 dependency check failed.' }
& $python (Join-Path $PSScriptRoot 'sam3_masks.py') doctor
if ($LASTEXITCODE -ne 0) { throw 'SAM3 runtime check failed.' }
Write-Host 'SAM3 software installed. Run DOWNLOAD-SAM3.cmd to obtain the official model weights.'
