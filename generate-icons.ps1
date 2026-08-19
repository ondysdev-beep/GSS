# Generování základních ikon pro GSS
Add-Type -AssemblyName System.Drawing

# Funkce pro vytvoření ikony
function Create-GSSIcon {
    param(
        [int]$Size,
        [string]$OutputPath
    )
    
    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    
    # Pozadí
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 45, 48))
    $graphics.FillRectangle($brush, 0, 0, $Size, $Size)
    
    # Text "GSS"
    $font = New-Object System.Drawing.Font ("Arial", $Size * 0.4, [System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(0, 255, 127))
    $textSize = $graphics.MeasureString("GSS", $font)
    $x = ($Size - $textSize.Width) / 2
    $y = ($Size - $textSize.Height) / 2
    $graphics.DrawString("GSS", $font, $textBrush, $x, $y)
    
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
}

# Vytvořit potřebné velikosti
Create-GSSIcon -Size 32 -OutputPath "src-tauri/icons/32x32.png"
Create-GSSIcon -Size 128 -OutputPath "src-tauri/icons/128x128.png"
Create-GSSIcon -Size 256 -OutputPath "src-tauri/icons/128x128@2x.png"

Write-Host "Ikony vytvořeny!"
