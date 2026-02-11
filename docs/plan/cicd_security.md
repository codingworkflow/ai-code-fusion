# CI/CD Security Baseline Plan

This document defines the CI/CD security and quality baseline for `ai-code-fusion`.

## Goals

- Keep software supply-chain visibility current in GitHub Security.
- Fail fast on code-quality and documentation-quality regressions.
- Use maintained GitHub Actions versions/pins with least-privilege permissions.
- Keep the workflow npm-first and lockfile-driven.

## Security and Quality Layers

1. Source and policy gates
- ESLint gate for `src/` and `tests/`.
- Markdown integrity lint (`scripts/lint-markdown-links.js`) for broken docs links/assets.
- Markdown style lint (`markdownlint-cli`) with `.markdownlint.json`.
- Changelog format lint (`scripts/validate-changelog.js`).

2. Dependency and supply-chain gates
- Dependency Review on pull requests.
- Dependency Review retries on snapshot warnings to allow for SBOM submission completion.
- SBOM generation in CI (`CycloneDX` artifact).
- SBOM-derived dependency snapshot submission to GitHub dependency graph.

3. Code scanning and secrets
- CodeQL analysis with a centralized config file (`.github/codeql/codeql-config.yml`).
- Secret detection gate (`secrets-gate.yml`).
- Poutine SARIF upload for dependency/update security signals.

4. Build/test execution
- QA matrix across Linux, Windows, and macOS.
- Unit/integration tests and stress benchmark artifact publishing.

## Implemented Baseline in This Repository

### CodeQL Base Config

- Workflow: `.github/workflows/codeql.yml`
- Config: `.github/codeql/codeql-config.yml`
- Uses explicit `paths-ignore` for generated build and bundle artifacts.

### Lint and Changelog Gates

- `npm run lint` now runs:
  - ESLint (`src/`, `tests/`)
  - Markdown lint (`lint:md`)
  - Changelog lint (`changelog:validate`)
- `lint:md` runs both:
  - Markdown link/asset checks
  - Markdown style policy checks

### SBOM Push to GitHub Security

- Workflow: `.github/workflows/sbom.yml`
- Existing CycloneDX SBOM generation/artifact is preserved.
- Dependency snapshot submission to the GitHub dependency graph runs in a separate trusted-only job with `contents: write`.
- Snapshot submission scans `package-lock.json` (lockfile scope) to avoid a second full-repository SBOM scan.

## Example Workflow Pattern

```yaml
name: ci-quality

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --runInBand
```

## Change Management Notes

- Keep CodeQL exclusions scoped to generated files only.
- Do not suppress tests/source broadly in security scans unless justified.
- Keep changelog entries in release-heading format: `## [vX.Y.Z] - YYYY-MM-DD`.
- Keep GitHub Actions references updated to maintained versions.
