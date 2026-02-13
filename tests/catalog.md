# Test Catalog

Purpose: quick map of what is covered, why it exists, and which command to run.

## Core Commands

- Full tests: `npm test -- --runInBand`
- Test catalog consistency (path + discovery checks): `npm run test:catalog`
- Stress metrics summary (+ optional Pushgateway publish): `npm run stress:metrics`
- Stress publish verification in Prometheus: `npm run prometheus:verify`
- End-to-end perf metrics job (`TOOLS_DOMAIN` aware): `npm run perf:test` or `make perf-test`
- Lint: `npm run lint`
- Formatter drift check (non-mutating): `npm run format:check`
- Markdown docs lint (links/images/icons): `npm run lint:md`
- Changelog format validation: `npm run changelog:validate`
- Electron E2E (Playwright): `npm run e2e:playwright`
- UI screenshot gate: `npm run qa:screenshot`
- Docs screenshots: `npm run docs:screenshots`
- Devcontainer smoke: `devcontainer up --workspace-folder .` then `devcontainer exec --workspace-folder . npm run lint`

## Unit Tests

| File                                                   | Primary Target                          | Key Use Cases                                                                                 |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tests/unit/components/app.test.tsx`                   | `src/renderer/components/App.tsx`       | Tab switching, config load, directory selection, processing flow, error handling              |
| `tests/unit/components/config-tab.test.tsx`            | `src/renderer/components/ConfigTab.tsx` | Config toggles/inputs, provider validation + connection test wiring, directory picker trigger |
| `tests/unit/components/file-tree.test.tsx`             | `src/renderer/components/FileTree.tsx`  | Tree render, folder expand/collapse, select all, empty-state behavior                         |
| `tests/unit/components/source-tab.test.tsx`            | `src/renderer/components/SourceTab.tsx` | Source tab input state, filter toggles, and event forwarding behavior                         |
| `tests/unit/file-analyzer.test.ts`                     | `src/utils/file-analyzer.ts`            | Include/exclude rules, gitignore behavior, binary handling, error cases                       |
| `tests/unit/gitignore-parser.test.ts`                  | `src/utils/gitignore-parser.ts`         | Pattern parsing, negation behavior, caching, nested path handling                             |
| `tests/unit/binary-detection.test.ts`                  | `src/utils/file-analyzer.ts`            | Binary signature detection, control-char thresholds, fallback-on-error behavior               |
| `tests/unit/utils/filter-utils.test.ts`                | `src/utils/filter-utils.ts`             | Path normalization, extension filtering, custom excludes, gitignore precedence                |
| `tests/unit/utils/secret-scanner.test.ts`              | `src/utils/secret-scanner.ts`           | Sensitive path detection, secret-pattern scanning, default-on safety toggles                  |
| `tests/unit/utils/fnmatch.test.ts`                     | `src/utils/fnmatch.ts`                  | Glob semantics: wildcards, classes, double-star, braces, path anchors                         |
| `tests/unit/utils/export-format.test.ts`               | `src/utils/export-format.ts`            | Export format normalization, XML attribute escaping, CDATA-safe sanitization                  |
| `tests/unit/utils/content-processor.test.ts`           | `src/utils/content-processor.ts`        | Content assembly, binary skip logic, malformed input handling                                 |
| `tests/unit/utils/config-manager.test.ts`              | `src/utils/config-manager.ts`           | Default config load, parse failures, graceful fallback behavior                               |
| `tests/unit/utils/token-counter.test.ts`               | `src/utils/token-counter.ts`            | Token counting basics, empty/null input handling                                              |
| `tests/unit/scripts/security.test.js`                  | `scripts/lib/security.js`               | Command safety validation, Windows path acceptance for approved executables                   |
| `tests/unit/scripts/actions-freshness.test.js`         | `scripts/lib/actions-freshness.js`      | Workflow `uses:` reference parsing, pinning classification, freshness markdown report output  |
| `tests/unit/scripts/eslint-config.test.js`             | `eslint.config.js`                      | Guard scoped unicorn/sonarjs strict-pack configuration and test exclusions                    |
| `tests/unit/scripts/sonar-options.test.js`             | `scripts/lib/sonar-options.js`          | Sonar scanner option merge behavior and CPD exclusion defaults                                |
| `tests/unit/scripts/publish-stress-metrics.test.js`    | `scripts/publish-stress-metrics.js`     | Prometheus payload generation and Pushgateway publication safeguards                          |
| `tests/unit/scripts/verify-prometheus-metrics.test.js` | `scripts/verify-prometheus-metrics.js`  | Prometheus scrape verification retries, timeouts, and parsing                                 |
| `tests/unit/scripts/perf-metrics-job.test.js`          | `scripts/run-perf-metrics-job.js`       | End-to-end performance job orchestration (stress, publish, verify)                            |
| `tests/unit/scripts/validate-test-catalog.test.js`     | `scripts/validate-test-catalog.js`      | Catalog path validity and Jest discovery coverage checks                                      |
| `tests/unit/scripts/validate-changelog.test.js`        | `scripts/validate-changelog.js`         | Release heading/date format checks, allowed section headings, latest release section coverage |
| `tests/unit/main/updater.test.ts`                      | `src/main/updater.ts`                   | Alpha/stable channel selection, platform gating, update-check result handling                 |
| `tests/unit/main/feature-flags.test.ts`                | `src/main/feature-flags.ts`             | OpenFeature normalization, env/remote merge rules, secure remote fetch behavior               |

## Integration Tests

| File                                                    | Primary Target                       | Key Use Cases                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `tests/integration/main-process/handlers.test.ts`       | Main IPC handlers                    | `fs:getDirectoryTree`, `repo:analyze`, `repo:process`, `tokens:countFiles`, `provider:testConnection` correctness and failures |
| `tests/integration/main-process/xml-export-e2e.test.ts` | XML export pipeline                  | End-to-end XML shape, CDATA wrapping, invalid-character sanitization, summary metrics                                          |
| `tests/integration/pattern-merging.test.ts`             | Filtering + gitignore merge behavior | Combined behavior of include/exclude patterns with gitignore toggles                                                           |

## Stress / Benchmark Tests

| File                                                   | Primary Target                 | Key Use Cases                                                                                              |
| ------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `tests/stress/main-process/ipc-latency.stress.test.ts` | Main process IPC tree handlers | Capture latency distribution and event-loop lag samples for `fs:getDirectoryTree` under large mocked trees |

Stress benchmark outputs:

- Raw benchmark JSON: `dist/benchmarks/*.json`
- Consolidated summary: `dist/benchmarks/summary.json`
- Prometheus text format: `dist/benchmarks/stress-metrics.prom`
- CI artifact: `stress-benchmarks-linux`
- Optional publish target: set `PUSHGATEWAY_URL` (and optional `PUSHGATEWAY_JOB`, `PUSHGATEWAY_INSTANCE`, `PUSHGATEWAY_STRICT=true`)
- Optional Prometheus verification tuning: `PROMETHEUS_VERIFY_TIMEOUT_MS`, `PROMETHEUS_VERIFY_POLL_INTERVAL_MS`, `PROMETHEUS_REQUEST_TIMEOUT_MS`
- TOOLS domain mode: set `TOOLS_DOMAIN` (for example `.114.be.tn`) and run `make perf-test` to derive `https://pushgateway.$TOOLS_DOMAIN` and `https://prometheus.$TOOLS_DOMAIN`, publish, then verify scrape visibility

## Electron E2E Tests

| File                                      | Primary Target                                | Key Use Cases                                                                                                     |
| ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/electron-process-flow.spec.ts` | Full renderer + preload + main-process wiring | Folder selection, file tree interaction, process flow, XML format handling, refresh-from-disk behavior, save flow |

## Visual Regression Signal

| Command                    | Primary Target                                      | Key Use Cases                                                                                                 |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run qa:screenshot`    | `scripts/capture-ui-screenshot.js` + renderer UI    | Cross-OS UI sanity, resized layout checks, deep file-tree selection visibility, secret-filter toggle behavior |
| `npm run docs:screenshots` | `scripts/generate-doc-screenshots.js` + renderer UI | Refresh tracked screenshots for Config/Select/Processed panels in `docs/APP_VIEWS.md`                         |

## Manual UI Doc Test

- `tests/manual/docs-ui-screenshots.md`

## Change-to-Test Mapping

- Filtering / gitignore logic:
  - `tests/unit/utils/filter-utils.test.ts`
  - `tests/unit/gitignore-parser.test.ts`
  - `tests/integration/pattern-merging.test.ts`
- File tree / selection UX:
  - `tests/unit/components/file-tree.test.tsx`
  - `npm run qa:screenshot`
- Renderer flow changes:
  - `tests/unit/components/app.test.tsx`
  - `tests/unit/components/config-tab.test.tsx`
  - `tests/e2e/electron-process-flow.spec.ts`
- Main process / IPC changes:
  - `tests/integration/main-process/handlers.test.ts`
  - `tests/unit/main/updater.test.ts`
  - `tests/unit/main/feature-flags.test.ts`
  - `tests/stress/main-process/ipc-latency.stress.test.ts`
- Content/token pipeline changes:
  - `tests/unit/file-analyzer.test.ts`
  - `tests/unit/utils/export-format.test.ts`
  - `tests/unit/utils/content-processor.test.ts`
  - `tests/unit/utils/token-counter.test.ts`
- Actions/workflow freshness automation changes:
  - `tests/unit/scripts/actions-freshness.test.js`
- CI quality gate/workflow changes:
  - `npm run lint`
  - `npm test -- --runInBand`
- XML export end-to-end:
  - `tests/integration/main-process/xml-export-e2e.test.ts`
