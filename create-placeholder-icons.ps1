# Vytvoření placeholder ikon - Tauri použije výchozí ikony
$iconPath = "src-tauri/icons"
New-Item -ItemType Directory -Force -Path $iconPath | Out-Null

# Vytvořit prázdné soubory jako placeholder
# Tauri si vytvoří výchozí ikony pokud tyto neexistují
$files = @(
    "32x32.png",
    "128x128.png", 
    "128x128@2x.png",
    "icon.ico",
    "icon.icns"
)

foreach ($file in $files) {
    $filePath = Join-Path $iconPath $file
    if (-not (Test-Path $filePath)) {
        New-Item -ItemType File -Path $filePath | Out-Null
    }
}

Write-Host "Placeholder ikony vytvořeny!"
