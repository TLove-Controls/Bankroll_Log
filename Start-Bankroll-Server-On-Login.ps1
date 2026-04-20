$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 3000
$OutLog = Join-Path $ProjectRoot 'server.log'
$ErrLog = Join-Path $ProjectRoot 'server.err'

function Test-ServerRunning {
    param(
        [int]$LocalPort
    )

    try {
        $listener = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction Stop
        return ($listener | Measure-Object).Count -gt 0
    } catch {
        return $false
    }
}

if (Test-ServerRunning -LocalPort $Port) {
    exit 0
}

$nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source

Start-Process `
    -FilePath $nodeCommand `
    -ArgumentList 'server.js' `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog
