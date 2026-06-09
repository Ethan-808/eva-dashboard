@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   ==============================
echo     E V A  Dashboard Launcher
echo   ==============================
echo.

:: ── Check if server is already running ─────────────────────
set PORT=
for %%p in (5173 5174 5175) do (
    if not defined PORT (
        curl -s --connect-timeout 1 -o nul http://localhost:%%p
        if !errorlevel! EQU 0 (
            set PORT=%%p
            echo [EVA] Server already running on port !PORT!
        )
    )
)

:: ── Start dev server if not already up ─────────────────────
if not defined PORT (
    echo [EVA] Starting Vite dev server...
    start /min "EVA Dev Server" cmd /k "npm run dev"

    echo [EVA] Waiting for server to boot...
    set WAIT=0

    :wait_loop
    if !WAIT! GEQ 20 goto boot_timeout

    for %%p in (5173 5174 5175) do (
        if not defined PORT (
            curl -s --connect-timeout 1 -o nul http://localhost:%%p
            if !errorlevel! EQU 0 set PORT=%%p
        )
    )

    if defined PORT goto server_ready
    timeout /t 1 /nobreak >nul
    set /a WAIT+=1
    goto wait_loop

    :boot_timeout
    echo [EVA] Server did not respond in 20s — defaulting to port 5173
    set PORT=5173
)

:server_ready
echo [EVA] Opening on http://localhost:!PORT!

:: ── Find Chrome ─────────────────────────────────────────────
set CHROME=
for /f "tokens=*" %%i in ('where chrome 2^>nul') do (
    if not defined CHROME set CHROME=%%i
)
if not defined CHROME (
    if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
        set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
    ) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
        set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    )
)

:: ── Launch ───────────────────────────────────────────────────
if defined CHROME (
    echo [EVA] Launching Chrome app window...
    start "" "!CHROME!" --app=http://localhost:!PORT! --window-size=1280,900
) else (
    echo [EVA] Chrome not found — opening default browser...
    start http://localhost:!PORT!
)

echo [EVA] Done.
echo.
