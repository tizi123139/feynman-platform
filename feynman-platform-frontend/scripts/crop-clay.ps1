Add-Type -AssemblyName System.Drawing
$src = "C:\Users\tizi\.qoder-cn\vibe_images"
$dest = "C:\Users\tizi\Desktop\project\feynman-platform\feynman-platform-frontend\src\assets\clay"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Get-ChildItem $src -Filter "clay-*.png" | ForEach-Object {
    $name = $_.BaseName -replace '^clay-', '' -replace '_\d+$', ''
    $target = Join-Path $dest ("{0}.png" -f $name)
    $side = if ($name -like 'scene-*') { 480 } else { 160 }
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    $bmp = New-Object System.Drawing.Bitmap $side, $side
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $srcRect = New-Object System.Drawing.Rectangle 62, 0, 900, 900
    $dstRect = New-Object System.Drawing.Rectangle 0, 0, $side, $side
    $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $bmp.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    Write-Output $target
}
