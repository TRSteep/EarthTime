param([string]$Wails = 'wails')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$previousTerrain = $env:VITE_EARTHTIME_TERRAIN
try {
    $version = (Get-Content -LiteralPath 'VERSION' -Raw).Trim()
    if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
    $output = Join-Path $root ".cache/releases/v$version"
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $files = @()
    # Finish with the default terrain build so frontend/dist remains the default edition.
    foreach ($edition in @('textures', 'relief')) {
        $env:VITE_EARTHTIME_TERRAIN = if ($edition -eq 'textures') { 'false' } else { 'true' }
        & $Wails build -platform windows/amd64 -trimpath -o "EarthTime-$edition.exe"
        if ($LASTEXITCODE -ne 0) { throw "Build failed: $edition" }
        $hasTerrain = Test-Path -LiteralPath 'frontend/dist/terrain/etopo2022-6min.bin.gz'
        if ($hasTerrain -ne ($edition -eq 'relief')) { throw "Wrong terrain assets: $edition" }
        $source = Join-Path $root "build/bin/EarthTime-$edition.exe"
        if ((Get-Item -LiteralPath $source).VersionInfo.ProductVersion -ne $version) {
            throw "Wrong executable version: $edition"
        }
        $destination = Join-Path $output "EarthTime-v$version-windows-amd64-$edition.exe"
        Copy-Item -LiteralPath $source -Destination $destination
        $files += $destination
    }
    $checksums = foreach ($file in $files) {
        $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $(Split-Path $file -Leaf)"
    }
    $checksums | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Encoding ascii
    Write-Output "Release files: $output"
} finally {
    $env:VITE_EARTHTIME_TERRAIN = $previousTerrain
    Pop-Location
}
