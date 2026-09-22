Add-Type -AssemblyName System.Drawing
$assetRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
$iconPath = Join-Path $assetRoot 'uniplay.png'
function New-Panel([int]$width, [int]$height, [string]$destination, [bool]$sidebar) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphic = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphic.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
  $top = [System.Drawing.Color]::FromArgb(24, 10, 30)
  $bottom = [System.Drawing.Color]::FromArgb(62, 16, 70)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $top, $bottom, 45)
  $graphic.FillRectangle($brush, $rect)
  $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(76, 239, 42, 175))
  $graphic.FillEllipse($glowBrush, ($width - 105), -62, 175, 175)
  $glowBrush.Dispose()
  $icon = [System.Drawing.Image]::FromFile($iconPath)
  if ($sidebar) {
    $graphic.DrawImage($icon, (New-Object System.Drawing.Rectangle(40, 66, 84, 84)))
    $font = New-Object System.Drawing.Font('Arial', 20, [System.Drawing.FontStyle]::Bold)
    $small = New-Object System.Drawing.Font('Arial', 9, [System.Drawing.FontStyle]::Regular)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(218, 183, 221))
    $graphic.DrawString('UNiPLAY', $font, $white, 13, 170)
    $graphic.DrawString('VIDEO  /  AUDIO', $small, $muted, 23, 211)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(239, 42, 175), 3)
    $graphic.DrawLine($pen, 23, 252, 141, 252)
    $pen.Dispose(); $font.Dispose(); $small.Dispose(); $white.Dispose(); $muted.Dispose()
  } else {
    $graphic.DrawImage($icon, (New-Object System.Drawing.Rectangle(10, 7, 43, 43)))
    $font = New-Object System.Drawing.Font('Arial', 15, [System.Drawing.FontStyle]::Bold)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $graphic.DrawString('UNiPLAY', $font, $white, 54, 14)
    $font.Dispose(); $white.Dispose()
  }
  $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $icon.Dispose(); $brush.Dispose(); $graphic.Dispose(); $bitmap.Dispose()
}
New-Panel 164 314 (Join-Path $assetRoot 'installer-sidebar.bmp') $true
New-Panel 150 57 (Join-Path $assetRoot 'installer-header.bmp') $false
