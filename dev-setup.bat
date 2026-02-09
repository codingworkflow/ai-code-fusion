@echo off

if not "%OS%"=="Windows_NT" (
    echo This script must be run on Windows only.
    exit /b 1
)

set APP_NAME=ai-code-fusion
set APP_DATA=%APPDATA%\%APP_NAME%

echo === Cleaning app settings ===
if exist "%APP_DATA%" (
    echo Removing %APP_DATA%...
    rmdir /s /q "%APP_DATA%"
) else (
    echo No settings found at %APP_DATA%, skipping.
)

echo.
echo === Installing dependencies ===
call npm install

echo.
echo === Starting in dev mode ===
call npm run dev
