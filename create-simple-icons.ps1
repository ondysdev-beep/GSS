# Vytvoření jednoduchých placeholder ikon
# Pro Windows můžeme použít i prázdné soubory, Tauri si vytvoří výchozí

# Vytvořit prázdné soubory jako placeholder
$iconPath = "src-tauri/icons"
New-Item -ItemType Directory -Force -Path $iconPath | Out-Null

# Vytvořit 32x32 placeholder
$bitmap = [System.Drawing.Bitmap]::new(32, 32)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(0, 255, 127))
$bitmap.Save("$iconPath/32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

# Zkopírovat pro ostatní velikosti
Copy-Item "$iconPath/32x32.png" "$iconPath/128x128.png" -Force
Copy-Item "$iconPath/32x32.png" "$iconPath/128x128@2x.png" -Force
Copy-Item "$iconPath/32x32.png" "$iconPath/icon.ico" -Force
Copy-Item "$iconPath/32x32.png" "$iconPath/icon.icns" -Force

Write-Host "Placeholder ikony vytvořeny!"
