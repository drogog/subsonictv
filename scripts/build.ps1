param(
    [Parameter(Mandatory = $true)][string]$Profile,
    [string]$TizenCli = 'tizen'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stagePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.build/widget'))
$outputPath = Join-Path $projectRoot 'dist'
if (-not $stagePath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Build staging directory is outside the project.'
}
Get-Command $TizenCli -ErrorAction Stop | Out-Null
if (Test-Path -LiteralPath $stagePath) { Remove-Item -LiteralPath $stagePath -Recurse -Force }
New-Item -ItemType Directory -Path $stagePath -Force | Out-Null
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$sourcePath = Join-Path $projectRoot 'subsonic-tv'
foreach ($file in @('config.xml','index.html','icon.png','icon.svg')) {
    Copy-Item -LiteralPath (Join-Path $sourcePath $file) -Destination $stagePath
}
foreach ($file in @('LICENSE','NOTICE')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stagePath
}
Copy-Item -LiteralPath (Join-Path $sourcePath 'css') -Destination $stagePath -Recurse
$scriptRoot = Join-Path $sourcePath 'js'
foreach ($file in Get-ChildItem -LiteralPath $scriptRoot -Recurse -File) {
    $relative = $file.FullName.Substring($scriptRoot.Length + 1)
    if ($relative -eq 'config.js') { continue }
    $destination = Join-Path (Join-Path $stagePath 'js') $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination
}
# Never copy the developer's reusable server credentials into staging.
Copy-Item -LiteralPath (Join-Path $sourcePath 'js/config.example.js') -Destination (Join-Path $stagePath 'js/config.js') -Force
& $TizenCli package -t wgt -s $Profile -- $stagePath
if ($LASTEXITCODE -ne 0) { throw "Tizen packaging failed (exit $LASTEXITCODE)." }
$packages = @(Get-ChildItem -LiteralPath $stagePath -Filter '*.wgt' -File)
if ($packages.Count -ne 1) { throw 'Expected exactly one generated WGT in the staging directory.' }
$resultPath = Join-Path $outputPath $packages[0].Name
Copy-Item -LiteralPath $packages[0].FullName -Destination $resultPath -Force
Write-Output "Built $resultPath with a blank server configuration. Connect through Settings on the TV."
