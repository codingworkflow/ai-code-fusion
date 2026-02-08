# AGENTS.md

Lightweight rules for automated agents and contributors in this repository.

## Scope

- Keep changes focused and minimal.
- Do not make unrelated refactors.

## Tests and Quality

- Before proposing merge-ready changes, run:
  - `npm run lint`
  - `npm test -- --runInBand`
- If UI behavior/layout is changed, also run:
  - `npm run qa:screenshot`
- Do not mark work complete while required CI checks are failing.

## `.env` Policy (Local-Only)

- `.env` in this repo is for local development bootstrap only.
- Keep `.env` tracked; do not remove/rename it.
- Do not over-engineer or heavily refactor `.env` for non-local use.
- Never commit secrets/tokens in `.env`.
- Use Vault/environment-provided secrets for real credentials.

## Review Focus for Agents

- Treat `.env` changes as sensitive even when local-only.
- Ensure `.env` updates are minimal, intentional, and documented in PR notes.
- Reject any hardcoded secret, token, or credential exposure in code, docs, or PR text.
