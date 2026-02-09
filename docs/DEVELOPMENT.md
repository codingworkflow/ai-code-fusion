# Development Guide

## Prerequisites

- Node.js (v20 or later)
- npm
- Git

## Command Entry Points

### Linux/macOS

Use the repository `Makefile`:

```bash
make <command>
```

### Windows

Use `make.bat` from Command Prompt:

```cmd
make <command>
```

If the repository is opened via a WSL UNC path (`\\wsl.localhost\...`), use PowerShell:

```powershell
.\make.ps1 <command>
```

## Common Commands

```bash
# Setup / development
make setup
make dev

# Build
make build
make build-win
make build-linux
make build-mac

# Quality
make test
make lint
make lint-md
make format
make validate
make qa
make docs-screenshots

# Security / dependency automation
make security
make gitleaks
make sbom
make renovate
make renovate-local
make mend-scan
```

## Security and Dependency Automation

- `make security` runs `gitleaks` + `sbom`.
- `make gitleaks` writes `dist/security/gitleaks/gitleaks-report.json`.
- `make sbom` writes `dist/security/sbom/sbom.cyclonedx.json`.
- `make renovate` runs Renovate against the remote repository.
- `make renovate-local` runs a local dry-run and writes `dist/security/renovate/renovate-local-report.json`.
- `make mend-scan` runs Mend Unified Agent if installed.

Renovate token sources (in order):

- `RENOVATE_TOKEN`
- `GITHUB_TOKEN`
- `GH_TOKEN`
- `GITHUB_COM_TOKEN`
- `RENOVATE_TOKEN_FILE`
- `gh auth token` (GitHub CLI fallback)

## Manual Setup (Without Make)

```bash
npm ci
npm run build:ts
npm run build:css
npm run build:webpack
npm run dev
```

## Release

```bash
node scripts/index.js release <version>
```

Where `<version>` is a semantic version (`1.2.3`) or one of `patch`, `minor`, `major`.
