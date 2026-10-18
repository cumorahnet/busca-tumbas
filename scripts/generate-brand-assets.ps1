param([switch]$WebIconsOnly)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'branding/logo-transparent.png'))
function Save-BrandImage([string]$relativePath, [int]$width, [int]$height, [double]$fraction, [bool]$opaque, [string]$background = '#f8fafc') {
    $target = Join-Path $projectRoot $relativePath
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear($(if ($opaque) { [System.Drawing.ColorTranslator]::FromHtml($background) } else { [System.Drawing.Color]::Transparent }))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $side = [int]([Math]::Min($width, $height) * $fraction)
    $graphics.DrawImage($source, [int](($width - $side) / 2), [int](($height - $side) / 2), $side, $side)
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $bitmap.Dispose()
}
try {
    foreach ($size in @(32, 64, 180, 192, 512)) { Save-BrandImage "assets/brand/icon-$size.png" $size $size 1 $true '#5c4e99' }
    Save-BrandImage 'assets/brand/icon-maskable-512.png' 512 512 0.72 $true '#5c4e99'
    if ($WebIconsOnly) { return }
    Save-BrandImage 'assets/brand/logo.png' 512 512 1 $false
    Save-BrandImage 'android/app/src/main/res/drawable-nodpi/buscatumbas_logo.png' 512 512 1 $false
    $densities = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }
    foreach ($density in $densities.Keys) {
        $size = $densities[$density]
        Save-BrandImage "android/app/src/main/res/mipmap-$density/ic_launcher.png" $size $size 1 $true
        Save-BrandImage "android/app/src/main/res/mipmap-$density/ic_launcher_round.png" $size $size 0.86 $true
        $foregroundSize = [int]($size * 108 / 48)
        Save-BrandImage "android/app/src/main/res/mipmap-$density/ic_launcher_foreground.png" $foregroundSize $foregroundSize 0.70 $false
    }
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'android/app/src/main/res') -Filter splash.png -Recurse | ForEach-Object {
        $image = [System.Drawing.Image]::FromFile($_.FullName); $width = $image.Width; $height = $image.Height; $image.Dispose()
        $relative = $_.FullName.Substring($projectRoot.Length + 1)
        Save-BrandImage $relative $width $height 0.40 $true
    }
} finally { $source.Dispose() }
Write-Output 'Brand assets generated.'
