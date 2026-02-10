# Backlog Kanban

## Ready

### P0: Implement Poutine CI Security Scan and Triage Findings

- Status: `READY`
- Priority: `P0`
- Type: `Security / CI`
- Owner: `Unassigned`

#### Context

Public repositories in the org are moving toward required poutine workflow enforcement. `ai-code-fusion` should implement poutine scanning now so future org-level enforcement does not break CI.

#### Outcome

Add a repository workflow that runs poutine against GitHub Actions configurations, uploads SARIF to code scanning, and leaves the repository with actionable findings fixed or narrowly acknowledged.

#### Implementation Instructions

1. Create `.github/workflows/poutine.yml`.
2. Configure triggers:
   - `pull_request` on `main`
   - `push` on `main`
   - `workflow_dispatch`
   - weekly schedule (for example Monday 05:00 UTC)
3. Set least-privilege permissions:
   - workflow-level: `contents: read`
   - job-level: `contents: read`, `security-events: write`
4. Add one `poutine` job on `ubuntu-latest`.
5. Implement steps:
   - checkout with pinned SHA (`actions/checkout`)
   - run `boostsecurityio/poutine-action` pinned to immutable commit SHA
     - `format: sarif`
     - `output: results.sarif`
   - upload SARIF with pinned `github/codeql-action/upload-sarif`
     - `sarif_file: results.sarif`
   - upload `results.sarif` as artifact (14-day retention)
6. Do not set `continue-on-error` for the poutine scan step.
7. Triage findings in `.github/workflows/*.yml`:
   - fix real issues directly
   - keep actions pinned to immutable SHAs
   - avoid self-hosted runners for PR-triggered workflows in this public repo
8. If a finding is non-actionable, add `.poutine.yml` with minimal skip rules and explicit rationale comments. Keep skips path-scoped where possible.
9. Update `docs/DEVELOPMENT.md` with a short CI/security note about the new poutine workflow.

#### Constraints

- Do not weaken existing security workflows:
  - `.github/workflows/codeql.yml`
  - `.github/workflows/dependency-review.yml`
  - `.github/workflows/qa-matrix.yml`
  - `.github/workflows/release.yml`
  - `.github/workflows/sbom.yml`
  - `.github/workflows/secrets-gate.yml`
  - `.github/workflows/sonarcloud.yml`
- Keep existing pinned-action security posture.
- No unrelated refactors.

#### Acceptance Criteria

1. `.github/workflows/poutine.yml` runs successfully on PR and push to `main`.
2. SARIF is uploaded successfully and visible in GitHub code scanning.
3. Poutine workflow is green on `main`.
4. Any `.poutine.yml` skip has explicit rationale and narrow scope.
5. Existing checks remain green.

#### Verification Commands

```bash
npm run lint
npm test -- --runInBand
```

## In Progress

- None.

## Done

- None.
