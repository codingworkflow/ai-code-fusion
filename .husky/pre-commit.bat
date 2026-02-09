@echo off
npx lint-staged
if errorlevel 1 exit /b %errorlevel%
npm run gitleaks:staged
if errorlevel 1 exit /b %errorlevel%
