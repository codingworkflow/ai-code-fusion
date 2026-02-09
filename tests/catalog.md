# Test Catalog

Purpose: quick map of what is covered, why it exists, and which command to run.

## Core Commands

- Full tests: `npm test -- --runInBand`
- Lint: `npm run lint`
- Markdown docs lint (links/images/icons): `npm run lint:md`
- UI screenshot gate: `npm run qa:screenshot`
- Docs screenshots: `npm run docs:screenshots`

## Unit Tests

| File                                         | Primary Target                          | Key Use Cases                                                                    |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `tests/unit/components/app.test.tsx`         | `src/renderer/components/App.tsx`       | Tab switching, config load, directory selection, processing flow, error handling |
| `tests/unit/components/config-tab.test.tsx`  | `src/renderer/components/ConfigTab.tsx` | Config toggles/inputs, callback wiring, directory picker trigger                 |
| `tests/unit/components/file-tree.test.tsx`   | `src/renderer/components/FileTree.tsx`  | Tree render, folder expand/collapse, select all, empty-state behavior            |
| `tests/unit/file-analyzer.test.ts`           | `src/utils/file-analyzer.ts`            | Include/exclude rules, gitignore behavior, binary handling, error cases          |
| `tests/unit/gitignore-parser.test.ts`        | `src/utils/gitignore-parser.ts`         | Pattern parsing, negation behavior, caching, nested path handling                |
| `tests/unit/binary-detection.test.ts`        | `src/utils/binary-detection.ts`         | Binary signature detection, control-char thresholds, fallback-on-error behavior  |
| `tests/unit/utils/filter-utils.test.ts`      | `src/utils/filter-utils.ts`             | Path normalization, extension filtering, custom excludes, gitignore precedence   |
| `tests/unit/utils/secret-scanner.test.ts`    | `src/utils/secret-scanner.ts`           | Sensitive path detection, secret-pattern scanning, default-on safety toggles     |
| `tests/unit/utils/fnmatch.test.ts`           | `src/utils/fnmatch.ts`                  | Glob semantics: wildcards, classes, double-star, braces, path anchors            |
| `tests/unit/utils/export-format.test.ts`     | `src/utils/export-format.ts`            | Export format normalization, XML attribute escaping, CDATA-safe sanitization     |
| `tests/unit/utils/content-processor.test.ts` | `src/utils/content-processor.ts`        | Content assembly, binary skip logic, malformed input handling                    |
| `tests/unit/utils/config-manager.test.ts`    | `src/utils/config-manager.ts`           | Default config load, parse failures, graceful fallback behavior                  |
| `tests/unit/utils/token-counter.test.ts`     | `src/utils/token-counter.ts`            | Token counting basics, empty/null input handling                                 |
| `tests/unit/scripts/security.test.js`        | `scripts/lib/security.js`               | Command safety validation, Windows path acceptance for approved executables      |

## Integration Tests

| File                                                    | Primary Target                       | Key Use Cases                                                                                       |
| ------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `tests/integration/main-process/handlers.test.ts`       | Main IPC handlers                    | `fs:getDirectoryTree`, `repo:analyze`, `repo:process`, `tokens:countFiles` correctness and failures |
| `tests/integration/main-process/xml-export-e2e.test.ts` | XML export pipeline                  | End-to-end XML shape, CDATA wrapping, invalid-character sanitization, summary metrics               |
| `tests/integration/pattern-merging.test.ts`             | Filtering + gitignore merge behavior | Combined behavior of include/exclude patterns with gitignore toggles                                |

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
- Main process / IPC changes:
  - `tests/integration/main-process/handlers.test.ts`
- Content/token pipeline changes:
  - `tests/unit/file-analyzer.test.ts`
  - `tests/unit/utils/export-format.test.ts`
  - `tests/unit/utils/content-processor.test.ts`
  - `tests/unit/utils/token-counter.test.ts`
- XML export end-to-end:
  - `tests/integration/main-process/xml-export-e2e.test.ts`
