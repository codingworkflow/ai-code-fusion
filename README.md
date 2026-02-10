# AI Code Fusion

## Features

A desktop app to prepare code repositories for AI workflows.

- Visual directory explorer for selecting code files
- File filtering with custom patterns and `.gitignore` support
- Token counting support for selected files
- Processed output ready to copy/export for AI tools
- Export format selector: Markdown or XML
- Cross-platform support (Windows, macOS, Linux)
- UI panel screenshots: `docs/APP_VIEWS.md`

## Processed Output Example

![Processed Output panel](docs/images/app-processed-panel.png)

Full sample files:

- Markdown: [`docs/examples/output-markdown.md`](docs/examples/output-markdown.md)
- XML: [`docs/examples/output.xml`](docs/examples/output.xml)

### Markdown export example

````md
# Repository Analysis

## src/App.tsx

```ts
export function App() {
  return <main>Hello AI Code Fusion</main>;
}
```

Tokens: 120
````

### XML export example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<repository totalFiles="1" totalTokens="120">
  <file path="src/App.tsx" tokens="120"><![CDATA[
export function App() {
  return <main>Hello AI Code Fusion</main>;
}
  ]]></file>
</repository>
```

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

## Dev Container

This repo includes `.devcontainer/` for a reproducible local environment.

- Node.js: 20 (matches CI)
- npm: bundled with Node 20 (currently 10.x)
- Container user: `vscode` (`uid=1000`)
- Host git/ssh path mounted from `${HOME}` at `/host-home` and linked to container home

Windows note:

- If `${HOME}` is not set in your shell, set it to your user profile before `devcontainer up`.

Smoke test with Dev Containers CLI:

```bash
devcontainer read-configuration --workspace-folder .
devcontainer build --workspace-folder .
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . node -v
devcontainer exec --workspace-folder . npm -v
devcontainer exec --workspace-folder . id -u
devcontainer exec --workspace-folder . npm run lint
```

## License

GPL 3.0
