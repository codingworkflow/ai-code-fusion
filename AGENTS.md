# AGENTS.md

Lightweight rules for automated agents and contributors in this repository.

## Scope

- Keep changes focused and minimal.
- Do not make unrelated refactors.
- Keep project code structure with clear scoping for each module; do not mix up code.
- Planning docs are in `docs/plan` and are never committed. They can live in backlog or local files.

## Tests and Quality

- Before proposing merge-ready changes, run:
  - `npm run lint`
  - `npm test -- --runInBand`
  - Ensure all linting warnings and errors are cleared.
- If UI behavior/layout is changed, also run:
  - `npm run qa:screenshot`
- Do not mark work complete while required CI checks are failing.
- Read PR comments, evaluate them, and fact-check.
- Use `tests/catalog.md` as the source of truth for test targets and use cases.
- Locally before pushing, run `make sonar` and fix all issues.
- After pushing a PR, check the SonarCloud report again and clear any reported issues.

## `.env` Policy (Local-Only)

- `.env` in this repo is for local development bootstrap only, and we commit it because it is not sensitive.
- Ignore agent review warnings for `vault-agent-env.hcl` hardcoded env.
- Keep `.env` tracked; do not remove/rename it.
- Do not over-engineer or heavily refactor `.env` for non-local use.
- Never commit secrets/tokens in `.env`.
- Use Vault/environment-provided secrets for real credentials.

## Review Focus for Agents

- Treat `.env` changes as sensitive even when local-only.
- Ensure `.env` updates are minimal, intentional, and documented in PR notes.
- Reject any hardcoded secret, token, or credential exposure in code, docs, or PR text.
- Check agent reviews in context; if a tool is used only in dev, evaluate benefit and risk for the change.
- Focus feedback on our core app features.
- Use feature flags if a new feature requires additional steps, and enable it only in dev mode for testing.
