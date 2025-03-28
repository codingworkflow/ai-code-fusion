@echo off
setlocal enabledelayedexpansion enableextensions

rem -------------------------------------------------------------
rem AI Code Fusion - Build Script for Windows
rem -------------------------------------------------------------

rem Ensure we're in the correct directory
set "MAKE_ROOT=%~dp0"
cd /d "%MAKE_ROOT%"

rem Make scripts executable if coming from Unix/WSL
if exist ".git" (
  git update-index --chmod=+x scripts/index.js >nul 2>&1
  git update-index --chmod=+x scripts/lib/*.js >nul 2>&1
)

rem Special handling for release command to pass version
if /i "%1"=="release" (
  if "%2"=="" (
    echo Error: Version argument is required for release command
    echo Usage: make release ^<version^>
    echo Example: make release 1.0.0
    exit /b 1
  )
  scripts\index.js release %2
  exit /b %errorlevel%
)

rem Special handling for dev command on Windows
if /i "%1"=="dev" (
  echo Starting development environment for Windows...

  rem Set environment variables
  set NODE_ENV=development

  rem Build CSS if needed
  if not exist "src\renderer\output.css" (
    echo Building CSS...
    call npm run build:css
  )

  rem Build webpack bundle if needed
  if not exist "src\renderer\index.js" (
    echo Building webpack bundle...
    call npm run build:webpack
  )

  echo Starting development server...
  npx concurrently --kill-others "npm:watch:css" "npm:watch:webpack" "npx electron ."
  exit /b %errorlevel%
)

rem Run the command through our unified Node.js script
node scripts/index.js %*
exit /b %errorlevel%
