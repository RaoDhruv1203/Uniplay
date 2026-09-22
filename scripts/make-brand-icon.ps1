Add-Type -AssemblyName System.Drawing
$assetRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
$sizes = @(16, 32, 48, 256)
$images = @()

foreach ($size in $sizes) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphic = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphic.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphic.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphic.ScaleTransform($size / 256, $size / 256)
  $background = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $background.AddArc(16, 16, 116, 116, 180, 90)
  $background.AddArc(124, 16, 116, 116, 270, 90)
  $background.AddArc(124, 124, 116, 116, 0, 90)
  $background.AddArc(16, 124, 116, 116, 90, 90)
  $background.CloseFigure()
  $dark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(19, 10, 23))
  $graphic.FillPath($dark, $background)
  $u = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $u.StartFigure()
  $u.AddLine(68, 74, 68, 147)
  $u.AddBezier(68, 147, 68, 184, 91, 206, 128, 206)
  $u.AddBezier(128, 206, 164, 206, 188, 184, 188, 147)
  $u.AddLine(188, 147, 188, 74)
  $u.AddLine(188, 74, 157, 74)
  $u.AddLine(157, 74, 157, 146)
  $u.AddBezier(157, 146, 157, 166, 147, 177, 128, 177)
  $u.AddBezier(128, 177, 109, 177, 99, 166, 99, 146)
  $u.AddLine(99, 146, 99, 74)
  $u.CloseFigure()
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(68, 74, 120, 132), [System.Drawing.Color]::FromArgb(250, 42, 155), [System.Drawing.Color]::FromArgb(156, 60, 246), 45)
  $graphic.FillPath($gradient, $u)
  $play = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $play.AddPolygon([System.Drawing.Point[]]@([System.Drawing.Point]::new(112, 97), [System.Drawing.Point]::new(157, 128), [System.Drawing.Point]::new(112, 159)))
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $graphic.FillPath($white, $play)
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $images += ,$stream.ToArray()
  if ($size -eq 256) { $bitmap.Save((Join-Path $assetRoot 'uniplay.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $stream.Dispose(); $white.Dispose(); $play.Dispose(); $gradient.Dispose(); $u.Dispose(); $dark.Dispose(); $background.Dispose(); $graphic.Dispose(); $bitmap.Dispose()
}

$file = [System.IO.File]::Open((Join-Path $assetRoot 'uniplay.ico'), [System.IO.FileMode]::Create)
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
  $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
  $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$images[$index].Length); $writer.Write([uint32]$offset)
  $offset += $images[$index].Length
}
foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
$writer.Dispose(); $file.Dispose()
