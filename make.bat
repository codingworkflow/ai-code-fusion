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

rem Map commands to npm scripts or node scripts/index.js commands
if /i "%1"=="setup" (
  call npm install
  exit /b %errorlevel%
)

if /i "%1"=="dev" (
  call npm start
  exit /b %errorlevel%
)

if /i "%1"=="build" (
  call npm run build
  exit /b %errorlevel%
)

if /i "%1"=="build-win" (
  call npm run build:win
  exit /b %errorlevel%
)

if /i "%1"=="build-mac" (
  call npm run build:mac
  exit /b %errorlevel%
)

if /i "%1"=="build-mac-arm" (
  call npm run build:mac-arm
  exit /b %errorlevel%
)

if /i "%1"=="build-mac-universal" (
  call npm run build:mac-universal
  exit /b %errorlevel%
)

if /i "%1"=="build-linux" (
  call npm run build:linux
  exit /b %errorlevel%
)

if /i "%1"=="test" (
  call npm test
  exit /b %errorlevel%
)

if /i "%1"=="lint" (
  call npm run lint
  exit /b %errorlevel%
)

if /i "%1"=="format" (
  call npm run format
  exit /b %errorlevel%
)

if /i "%1"=="clean" (
  call npm run clean
  exit /b %errorlevel%
)

if /i "%1"=="release" (
  if "%2"=="" (
    echo Error: Version argument is required for release command
    echo Usage: make release ^<version^>
    echo Example: make release 1.0.0
    exit /b 1
  )
  call npm run release -- %2
  exit /b %errorlevel%
)

if /i "%1"=="sonar" (
  call npm run sonar
  exit /b %errorlevel%
)

if /i "%1"=="help" (
  echo Available commands:
  echo   setup              - Install dependencies
  echo   dev                - Start development environment
  echo   build              - Build for current platform
  echo   build-win          - Build for Windows
  echo   build-mac          - Build for macOS
  echo   build-mac-arm      - Build for macOS ARM
  echo   build-mac-universal - Build for macOS Universal
  echo   build-linux        - Build for Linux
  echo   test               - Run tests
  echo   lint               - Run linting
  echo   format             - Format code
  echo   clean              - Clean build artifacts
  echo   release ^<version^>  - Create a new release
  echo   sonar              - Run SonarQube analysis
  exit /b 0
)

if "%1"=="" (
  call :help
  exit /b 0
)

echo Unknown command: %1
echo Type 'make help' for available commands
exit /b 1
