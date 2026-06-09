# setup-hotkey.ps1
# Creates a Desktop shortcut to EVA.bat with Ctrl+Shift+E hotkey

$ErrorActionPreference = "Stop"

$batPath     = Join-Path $PSScriptRoot "EVA.bat"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "EVA.lnk"

Write-Host ""
Write-Host "  EVA Hotkey Setup" -ForegroundColor Cyan
Write-Host "  ──────────────────────────────" -ForegroundColor DarkGray

if (-not (Test-Path $batPath)) {
    Write-Host "  [ERROR] EVA.bat not found at: $batPath" -ForegroundColor Red
    exit 1
}

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $batPath
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.HotKey           = "CTRL+SHIFT+E"
$shortcut.WindowStyle      = 7        # start minimized so console doesn't flash
$shortcut.Description      = "Launch EVA AI Dashboard"
$shortcut.Save()

Write-Host ""
Write-Host "  [OK] Desktop shortcut created" -ForegroundColor Green
Write-Host "       $shortcutPath" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [OK] Hotkey assigned: Ctrl + Shift + E" -ForegroundColor Green
Write-Host ""
Write-Host "  NOTES:" -ForegroundColor Yellow
Write-Host "  - The hotkey works from anywhere on Windows." -ForegroundColor White
Write-Host "  - If it doesn't respond immediately, sign out and back in once." -ForegroundColor White
Write-Host "  - The shortcut must stay on the Desktop for the hotkey to work." -ForegroundColor White
Write-Host "  - You can also double-click the EVA icon on your Desktop." -ForegroundColor White
Write-Host ""
