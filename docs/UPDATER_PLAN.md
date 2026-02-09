# Updater Plan

## Goal

Add a simple and safe desktop updater with an alpha channel first, then expand to stable once signing is in place.

## Current State

- Build pipeline already produces per-platform artifacts and `latest*.yml` metadata in release jobs.
- Runtime app does not currently include an in-app updater flow.
- Signing/notarization is planned but not yet enabled.

## Reference Pattern (draw.io-desktop)

Observed in `/workspaces/external/drawio-desktop`:

- Uses `electron-updater` with GitHub provider.
- Supports manual "Check for updates" and optional startup checks.
- Allows disabling updates in unsupported environments.
- Shows progress and install prompts in app UI.

This is a good baseline for our alpha implementation.

## Options

1. GitHub Releases provider (`electron-updater`)

- Pros: lowest complexity, no extra infra, fits current release workflow.
- Cons: tied to GitHub APIs/releases, less custom rollout control.

2. Generic hosted feed (S3/Cloudflare/GitHub Pages)

- Pros: more control over feed/CDN, easier migration later.
- Cons: additional hosting and operational setup.

3. Dedicated update service

- Pros: max control (channels, staged rollout, policy).
- Cons: highest implementation and maintenance cost.

## Recommended Path

Start with Option 1 for alpha:

- Add `electron-updater` integration in main process.
- Add manual "Check for updates" action (menu + IPC).
- Add alpha opt-in switch (config/state flag).
- Use prerelease tags (`vX.Y.Z-alpha.N`) for alpha channel.
- Keep Linux auto-update disabled initially; continue shipping Linux packages.

## Phased Delivery

### Phase 1: Alpha channel (now)

- Runtime checks GitHub prereleases only when alpha opt-in is enabled.
- Stable users continue to receive stable updates only.
- UI states:
  - Idle: "Check for updates"
  - Checking: disabled action + spinner label
  - Update available: prompt to download/install
  - Up-to-date: info message
  - Error: clear error message and log

### Phase 2: Stable channel

- Enable default startup checks for stable releases.
- Add configurable interval/backoff for update checks.
- Harden telemetry/logging for updater failures.

### Phase 3: Signing rollout

- Windows: code-sign release binaries.
- macOS: sign + notarize + staple.
- Linux: keep package-manager flow primary; evaluate in-app update policy by target format.

## Acceptance Criteria (Phase 1)

- Alpha build with prerelease tag is discoverable by alpha-enabled client.
- Stable client does not consume prerelease updates.
- Update flow is testable in CI via mocked provider events.
- No secrets or tokens are hardcoded in repo or workflow config.
