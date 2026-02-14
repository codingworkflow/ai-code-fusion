# AGENTS.md

Lightweight rules for automated agents and contributors in this repository.

## Scope

- Keep changes focused and minimal.
- Do not make unrelated refactors.
- Keep project code structure with clear scoping for each scoping, don't mixup up code.
- planning docs are in docs/plan and never committed, they can live in backlog or local files.

## Tests and Quality

- Before proposing merge-ready changes, run:
  - `npm run lint`
  - `npm test -- --runInBand`
  - ensure all linting warning errors are cleared
- If UI behavior/layout is changed, also run:
  - `npm run qa:screenshot`
- Do not mark work complete while required CI checks are failing.
- Read PR comments, evaluate and fact check,
- Use `tests/catalog.md` as the source of truth for test targets and use cases.
- Locally before pushing run make sonar and ensure to fix all issues.
- After pushing a PR, check SonarCloud report again and clear any reported issues.

## `.env` Policy (Local-Only)

- `.env` in this repo is for local development bootstrap only, and we commit it as it's not sensitive.
- ignore agents review for vault-agent-env.hcl over hardcoded env.
- Keep `.env` tracked; do not remove/rename it.
- Do not over-engineer or heavily refactor `.env` for non-local use.
- Never commit secrets/tokens in `.env`.
- Use Vault/environment-provided secrets for real credentials.

## Review Focus for Agents

- Treat `.env` changes as sensitive even when local-only.
- Ensure `.env` updates are minimal, intentional, and documented in PR notes.
- Reject any hardcoded secret, token, or credential exposure in code, docs, or PR text.
- Check agents/review over current use, if the tool is used in dev only, the evaluation the benefit risk for the change.
- Focus in feedback on our core app features.
- Use feature flag, if the new feature require other steps to complete and set it enabled only in dev mode so we can test it.
