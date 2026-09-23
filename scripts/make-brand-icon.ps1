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
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(16, 16, 224, 224), [System.Drawing.Color]::FromArgb(144, 61, 237), [System.Drawing.Color]::FromArgb(31, 27, 44), 45)
  $graphic.FillPath($gradient, $background)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $font = [System.Drawing.Font]::new('Segoe UI', 84, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $measured = $graphic.MeasureString('Uni', $font)
  $graphic.DrawString('Uni', $font, $white, (256 - $measured.Width) / 2, 58)
  $circle = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(65, 255, 255, 255))
  $graphic.FillEllipse($circle, 97, 161, 62, 62)
  $ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(180, 255, 255, 255), 2)
  $graphic.DrawEllipse($ring, 97, 161, 62, 62)
  $play = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $play.AddPolygon([System.Drawing.Point[]]@([System.Drawing.Point]::new(119, 174), [System.Drawing.Point]::new(146, 192), [System.Drawing.Point]::new(119, 210)))
  $graphic.FillPath($white, $play)
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $images += ,$stream.ToArray()
  if ($size -eq 256) { $bitmap.Save((Join-Path $assetRoot 'uniplay.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $stream.Dispose(); $ring.Dispose(); $circle.Dispose(); $white.Dispose(); $play.Dispose(); $font.Dispose(); $gradient.Dispose(); $background.Dispose(); $graphic.Dispose(); $bitmap.Dispose()
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
