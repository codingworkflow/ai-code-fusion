# AI Code Fusion

## Features

A desktop app to prepare code repositories for AI workflows.

- Visual directory explorer for selecting code files
- File filtering with custom patterns and `.gitignore` support
- Token counting support for selected files
- Processed output ready to copy/export for AI tools
- Cross-platform support (Windows, macOS, Linux)
- UI panel screenshots: `docs/APP_VIEWS.md`

## Download Release

Download the latest packaged build from GitHub Releases:
https://github.com/codingworkflow/ai-code-fusion/releases

- Windows: download and run the `.exe` installer
- macOS: download the `.dmg`, drag app to Applications
- Linux: download the `.AppImage`, then run:

```bash
chmod +x *.AppImage
./*.AppImage
```

## Build from Source

Requirements:

- Node.js (v20 or later)
- npm
- Git

```bash
git clone https://github.com/codingworkflow/ai-code-fusion
cd ai-code-fusion

npm ci
npm run build:webpack
npm run build
```

Optional platform-specific builds:

```bash
npm run build:win
npm run build:linux
npm run build:mac
```

## License

GPL 3.0
