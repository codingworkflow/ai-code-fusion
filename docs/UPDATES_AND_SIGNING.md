# Updates and Signing

This document defines the lightweight auto-update flow and the signing rollout plan for Windows, macOS, and Linux.

Current status: releases are intentionally unsigned until certificates and notarization credentials are ready.

## Current update flow

The app is planned to use `electron-updater` through IPC-safe handlers in the main process:

- `updates:getStatus` returns updater state
- `updates:check` triggers a manual check
- `updates:download` downloads an available update
- `updates:quitAndInstall` restarts and installs a downloaded update

Production behavior target:

- Updater initializes only for packaged production builds
- Automatic background check runs shortly after startup and then every 6 hours

## Release artifact requirements

For `electron-updater` to work, release assets must include metadata files in addition to installers:

- Windows: installer + `latest*.yml` + `.blockmap`
- macOS: `.zip`/`.dmg` + `latest*.yml` + `.blockmap`
- Linux (AppImage): `.AppImage` + `latest*.yml` (+ `.zsync` when generated)

The `release.yml` workflow is configured to upload these files.

## Signing plan

### 1) Windows signing (Authenticode)

Use an OV/EV code-signing certificate and configure GitHub secrets:

- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`

Electron Builder signs automatically when these are present.

### 2) macOS signing + notarization

Use Apple Developer ID Application certificate and notarization credentials:

- `MACOS_CSC_LINK`
- `MACOS_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `APPLE_TEAM_ID`

Recommended next step: add explicit notarization validation in CI logs and fail the build if notarization fails.

### 3) Linux signing (optional)

Linux app-signing is distribution-specific and less standardized than Windows/macOS:

- AppImage: optional GPG signing + checksum publication
- Debian/RPM: sign repository metadata and package artifacts

Pragmatic baseline:

- Publish SHA256 checksums for Linux artifacts in each release
- Add optional GPG detached signatures for `.AppImage`

## Rollout checklist

1. Merge changes and create a release tag (`vX.Y.Z`).
2. Confirm release assets include installers plus update metadata (`latest*.yml`, `.blockmap`, `.zsync`).
3. Configure signing secrets in repository settings.
4. Produce first signed release on Windows and macOS.
5. Validate update path end-to-end from previous version to latest version on each OS.
