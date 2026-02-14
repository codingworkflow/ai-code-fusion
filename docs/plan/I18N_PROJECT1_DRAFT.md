# Draft Item for org/repo `project1`

Use this as the draft issue/PR body for the i18n refactor.

## Title

`Draft: i18n refactor (EN/ES/FR/DE) + language selector + E2E coverage`

## Summary

Implement renderer internationalization in incremental phases:

- Add i18n framework and in-repo locale files (`en`, `es`, `fr`, `de`)
- Add language selector and locale persistence
- Migrate current hardcoded UI strings
- Add E2E language-switch validation
- Keep README localization as decoupled follow-up

Reference plan:

- `docs/plan/I18N_ROLLOUT_PLAN.md`

## Scope

- Renderer UI text and localization plumbing
- Unit and Playwright E2E updates
- Documentation updates for translation workflow

Out of scope for initial rollout:

- Remote translation platform integration
- Main-process/backend message localization
- Full multilingual README parity (separate step)

## Acceptance Criteria

- Language selector available in app UI (EN/ES/FR/DE)
- Selected locale persists across app restart
- No hardcoded strings remain in migrated renderer components
- Playwright validates language switch + persisted locale
- `npm run lint` and `npm test -- --runInBand` pass
- `npm run qa:screenshot` passes for UI deltas

## Step Plan (Small, Decoupled PRs)

1. Bootstrap i18n framework and locale files
2. Add language selector and persistence
3. Migrate Start + tab labels + configuration labels
4. Migrate source/processed/file-tree labels
5. Add E2E language-switch test and stabilize selectors
6. Update docs and optionally add translated README files

## Risks

- Selector brittleness in tests after localization
- Locale key drift between language files
- Mixed-language UI if migration is partial

## Mitigations

- Use stable `data-testid` where action text is translated
- Add locale-key parity checks in CI
- Merge component-by-component with explicit completion criteria

## Suggested GitHub Labels

- `enhancement`
- `i18n`
- `frontend`
- `tests`

## Suggested Milestone

- `i18n-v1`

## Suggested Commands for Implementation PRs

```bash
npm run lint
npm test -- --runInBand
npm run qa:screenshot
npm run e2e:playwright
```
