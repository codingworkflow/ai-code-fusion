# I18N Rollout Plan (EN/ES/FR/DE)

## Goal

Add first-class internationalization support in the renderer with:

- Default language: English (`en`)
- Additional launch languages: Spanish (`es`), French (`fr`), German (`de`)
- A user-facing language selector
- Stable unit + E2E coverage for language switching

This plan is split into small, merge-friendly steps to avoid risky big-bang changes.

## Current State Review

As of this plan, UI strings are hardcoded in renderer components and tests assert English labels directly. There is no i18n framework, no locale files, and no language preference persistence key.

Main hardcoded UI surfaces:

- `src/renderer/components/App.tsx`
- `src/renderer/components/TabBar.tsx`
- `src/renderer/components/ConfigTab.tsx`
- `src/renderer/components/SourceTab.tsx`
- `src/renderer/components/ProcessedTab.tsx`
- `src/renderer/components/FileTree.tsx`
- `tests/unit/components/*.test.tsx`
- `tests/e2e/electron-process-flow.spec.ts`

## Target Architecture (State of the Art, Repo-Fit)

Use `i18next` + `react-i18next` in the renderer only. Keep translations versioned in this repo and reviewed in pull requests.

### File Organization

| Path | Purpose |
| --- | --- |
| `src/renderer/i18n/index.ts` | i18n initialization and resources registration |
| `src/renderer/i18n/settings.ts` | supported locale list, default locale, storage key |
| `src/renderer/i18n/locales/en/common.json` | English source strings |
| `src/renderer/i18n/locales/es/common.json` | Spanish translations |
| `src/renderer/i18n/locales/fr/common.json` | French translations |
| `src/renderer/i18n/locales/de/common.json` | German translations |
| `src/renderer/components/LanguageSelector.tsx` | language picker UI in app header |
| `src/renderer/components/*` | migrated to `t('...')` keys instead of inline strings |
| `tests/unit/i18n/i18n-init.test.ts` | init defaults + fallback behavior |
| `tests/e2e/language-selector.spec.ts` | end-to-end language switching validation |
| `tests/catalog.md` | add mapping for new i18n tests |
| `docs/CONFIGURATION.md` | language setting documentation |
| `README.md` or `README.<locale>.md` | optional docs localization phase (decoupled) |

### Translation Namespace Convention

Start with one namespace (`common`) to reduce complexity, then split later only if needed.

Key style:

- `tab.start`
- `tab.selectFiles`
- `tab.processedOutput`
- `config.save`
- `source.changeFolder`
- `processed.refreshCode`
- `fileTree.selectAll`

## Translation Source-of-Truth Workflow

1. Add/update keys in `src/renderer/i18n/locales/en/common.json` first.
2. Mirror keys into `es/fr/de` files in the same PR.
3. Keep identical key structure across all locales.
4. CI rule: fail when locale keysets diverge.
5. No runtime remote translation fetches in v1; all translations are in-repo and shipped with the app.

## Incremental Delivery Plan

## Phase 1: i18n Foundation

Scope:

- Add dependencies: `i18next`, `react-i18next`.
- Initialize i18n in renderer boot path.
- Add locale files for `en/es/fr/de` with baseline keys.

Files:

- `package.json`
- `src/renderer/index.tsx`
- `src/renderer/i18n/index.ts`
- `src/renderer/i18n/settings.ts`
- `src/renderer/i18n/locales/*/common.json`
- `tests/unit/i18n/i18n-init.test.ts`

Exit criteria:

- App boots with i18n initialized.
- Missing keys fall back to English.

## Phase 2: Language Selector + Persistence

Scope:

- Add `LanguageSelector` in app header near existing controls.
- Persist selection in localStorage (for example `app.locale`).
- On startup, load persisted locale, fallback to browser locale, then fallback to `en`.

Files:

- `src/renderer/components/LanguageSelector.tsx`
- `src/renderer/components/App.tsx`
- `src/types/global.d.ts` (only if new global typing is required)

Exit criteria:

- User can switch between EN/ES/FR/DE.
- Selected locale persists across app restarts.

## Phase 3: Migrate Core UI Strings

Scope:

- Replace hardcoded labels in core screens with i18n keys:
  - Start/Select Files/Processed Output tabs
  - folder actions, save/copy/refresh controls
  - file tree labels and empty states

Files:

- `src/renderer/components/TabBar.tsx`
- `src/renderer/components/ConfigTab.tsx`
- `src/renderer/components/SourceTab.tsx`
- `src/renderer/components/ProcessedTab.tsx`
- `src/renderer/components/FileTree.tsx`

Exit criteria:

- Core UX is fully translatable with no user-facing hardcoded English in those components.

## Phase 4: Test Hardening (Unit + E2E)

Scope:

- Update existing tests to avoid brittle coupling to one language where not required.
- Add E2E language-switch flow with deterministic selectors.

Files:

- `tests/e2e/electron-process-flow.spec.ts` (stability updates)
- `tests/e2e/language-selector.spec.ts` (new)
- `tests/unit/components/*.test.tsx` (assertions updated)
- `tests/catalog.md`

E2E coverage requirements:

- Switch from English to Spanish and verify key UI labels update.
- Switch to French, restart app context, verify persisted locale.
- Switch to German and run a minimal process flow to ensure function + language coexist.

Exit criteria:

- `npm run e2e:playwright` passes with language selector coverage.

## Phase 5: Documentation and Repo Hygiene

Scope:

- Document i18n architecture and translation contribution workflow.
- Add a short translation maintenance section in contributor docs.

Files:

- `README.md`
- `docs/DEVELOPMENT.md`
- `docs/CONFIGURATION.md`
- Optional: `README.es.md`, `README.fr.md`, `README.de.md` (separate PR/step)

Exit criteria:

- New contributors can add/modify translations without guessing structure.

## CI / Quality Gates per Phase

Required before each merge-ready PR in this rollout:

- `npm run lint`
- `npm test -- --runInBand`

Additionally when UI behavior/layout changes:

- `npm run qa:screenshot`

Additionally when E2E tests are added/changed:

- `npm run e2e:playwright`

## Risks and Controls

| Risk | Control |
| --- | --- |
| Test brittleness from translated labels | Prefer `data-testid` for core actions; keep role assertions for accessibility |
| Missing keys across locales | Add locale key parity test in CI |
| Partial migration leaves mixed-language UI | Migrate per component and mark phase exit criteria strictly |
| README translation drift | Keep docs translation as an explicitly decoupled phase |

## Suggested PR Breakdown (Small Steps)

1. `feat(i18n): bootstrap i18next and locale files`
2. `feat(i18n): add language selector and locale persistence`
3. `refactor(i18n): migrate tab + config screen strings`
4. `refactor(i18n): migrate source + processed + file tree strings`
5. `test(i18n): add language-switch e2e and update unit tests`
6. `docs(i18n): document translation workflow and optional README localization`
