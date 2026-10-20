$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Join-Path $root 'branding/logo-transparent.png'))
function Save-IosBrand([string]$relative, [int]$size, [double]$fraction, [string]$background) {
    $target = Join-Path $root $relative
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml($background))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $side = [int]($size * $fraction)
        $offset = [int](($size - $side) / 2)
        $graphics.DrawImage($source, $offset, $offset, $side, $side)
        $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    Save-IosBrand 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png' 1024 1 '#5c4e99'
    foreach ($name in @('splash-2732x2732.png','splash-2732x2732-1.png','splash-2732x2732-2.png')) {
        Save-IosBrand "ios/App/App/Assets.xcassets/Splash.imageset/$name" 2732 0.36 '#f8fafc'
    }
} finally { $source.Dispose() }
Write-Output 'iOS brand assets generated from the existing logo.'
