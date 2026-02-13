# Contributing

## Contribution Model

We do not accept external pull requests for this repository.

This repository is a closed-source collaboration for maintainers and approved internal contributors.
Unsolicited external pull requests may be closed without review.

## Communication First

Use Discussions first for ideas and design proposals.
Use Issues for bugs and feature requests.

## Internal Maintainer Workflow

- Branch naming: `type/scope-short-summary` (examples: `feat/ui-export-preview`, `fix/filter-regression`).
- Commit messages: use clear conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`).
- Keep changes focused and minimal.
- Before merge-ready PR submission, run:
  - `npm run lint`
  - `npm test -- --runInBand`
  - `npm run qa:screenshot` when UI behavior or layout changes
- Ensure CI checks are green before merge.

## Security and Sensitive Data

- Never commit secrets, tokens, or credentials.
- Treat `.env` changes as sensitive and local-development only.
- For vulnerabilities, use private reporting as defined in `SECURITY.md`.
