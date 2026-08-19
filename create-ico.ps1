# Vytvoření .ico souboru z PNG pro Windows
# Použijeme existující 128x128 PNG a přejmenujeme na .ico
# Tauri si poradí s převodem

Copy-Item "src-tauri/icons/128x128.png" "src-tauri/icons/icon.ico" -Force
Copy-Item "src-tauri/icons/128x128.png" "src-tauri/icons/icon.icns" -Force

Write-Host "Ikonové soubory vytvořeny!"
