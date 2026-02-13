#!/bin/bash

# Detect OS and set app data path
case "$(uname -s)" in
    Linux*)
        APP_DATA="$HOME/.config/ai-code-fusion"
        ;;
    Darwin*)
        APP_DATA="$HOME/Library/Application Support/ai-code-fusion"
        ;;
    *)
        echo "Unsupported OS. Use dev-setup.bat on Windows."
        exit 1
        ;;
esac

echo "=== Cleaning app settings ==="
if [ -d "$APP_DATA" ]; then
    echo "Removing $APP_DATA..."
    rm -rf "$APP_DATA"
else
    echo "No settings found at $APP_DATA, skipping."
fi

echo ""
echo "=== Installing dependencies ==="
npm ci

echo ""
echo "=== Starting in dev mode ==="
npm run dev
