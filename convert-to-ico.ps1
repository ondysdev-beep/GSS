# Konverze PNG na ICO pomocí ImageMagick (pokud je nainstalovaný)
# Alternativa: Vytvoříme jednoduchý .ico z PNG dat

# Zkusíme ImageMagick
try {
    magick convert "src-tauri/icons/temp-icon.png" -resize 256x256 "src-tauri/icons/icon.ico"
    Write-Host "ICO vytvořen pomocí ImageMagick"
} catch {
    Write-Host "ImageMagick nenalezen, vytvářím jednoduchý ICO..."
    
    # Vytvoříme jednoduchý .ico soubor
    $pngPath = "src-tauri/icons/temp-icon.png"
    $icoPath = "src-tauri/icons/icon.ico"
    
    # Načteme PNG data
    $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
    
    # Vytvoříme základní ICO strukturu
    $icoHeader = [byte[]]@(0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    
    # Kombinujeme
    $icoData = $icoHeader + $pngBytes
    
    [System.IO.File]::WriteAllBytes($icoPath, $icoData)
    Write-Host "ICO vytvořen ručně"
}

# Zkopírujeme pro ostatní velikosti
Copy-Item "src-tauri/icons/temp-icon.png" "src-tauri/icons/32x32.png" -Force
Copy-Item "src-tauri/icons/temp-icon.png" "src-tauri/icons/128x128.png" -Force
Copy-Item "src-tauri/icons/temp-icon.png" "src-tauri/icons/128x128@2x.png" -Force
Copy-Item "src-tauri/icons/temp-icon.png" "src-tauri/icons/icon.png" -Force

Write-Host "Všechny ikony připraveny!"
