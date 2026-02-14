# Docs Centralization Backlog Draft (`docs.codingworkflow.com`)

Date: 2026-02-14  
Owner: `codingworkflow` org  
Status: `DRAFT`

## Problem Statement

The current per-repository docs publishing model does not scale for multi-project docs under one domain.

Current pain points:

1. Each repository can publish only its own docs in isolation.
2. Domain and Pages settings are duplicated and easy to misconfigure.
3. There is no single pipeline that updates all project docs in one pass.
4. Cross-project navigation/search quality is inconsistent.

## Proposed Direction

Create one central docs repository as the single deploy target for `docs.codingworkflow.com`.

Repository-level docs publishing workflows in product repos should remain disabled. Content should be synchronized into the central docs repository and deployed from there only.

## Scope

In scope:

1. Define central repository structure for multiple projects.
2. Define sync model from project repos into central repo.
3. Standardize central CI checks and deployment for docs.
4. Migrate this repository docs into the central repo structure.

Out of scope (for this draft):

1. Full rewrite of all docs content.
2. Large information architecture redesign across every project.
3. New authoring platform migration without a decision record.

## Central Repository Model (Draft)

Proposed structure:

```text
/docs
  /projects
    /ai-code-fusion
      ...synced docs...
    /project-b
      ...synced docs...
  /shared
    /standards
    /templates
```

Content flow:

1. Project repos keep local docs authoring (`/docs` remains source for each project team).
2. A sync job or bot PR copies selected docs into `/projects/<repo-name>/` in the central repo.
3. Central repo CI validates docs and builds one site.
4. Merge to central repo `main` triggers the only production deploy for `docs.codingworkflow.com`.

## Multi-Project Update Strategy

Recommended first implementation:

1. PR-based sync into central repo (auditable and easy rollback).
2. Per-project ownership over its own subtree (`/projects/<repo-name>/`).
3. Central owners review shared-nav/search/config changes.

Future optimization:

1. Batch sync from multiple repos in one scheduled run.
2. Auto-generated cross-project index pages.

## Dependencies and Preconditions

1. Central repository created in `codingworkflow` org.
2. Domain/DNS/TLS ownership validated once for `docs.codingworkflow.com`.
3. CODEOWNERS and branch protection configured in central repo.
4. A docs sync token/app with least privilege.

## Backlog Tasks

1. Create central docs repository and baseline site config.
2. Add central CI: docs lint, link check, build, deploy.
3. Add sync workflow template for project repos -> central repo PR.
4. Onboard `ai-code-fusion` docs into `/projects/ai-code-fusion/`.
5. Onboard at least one additional project to validate multi-project pattern.
6. Document ownership/governance model for shared vs project-specific docs.

## Acceptance Criteria

1. `docs.codingworkflow.com` is deployed from one central repository only.
2. This repository has no active job that deploys docs directly.
3. At least two project docs trees are published through the central pipeline.
4. Broken-link checks and docs build checks are required on central PRs.
5. A documented rollback path exists for bad docs deploys.

## Migration Notes

Already completed in this repository:

1. Disabled repo-level Pages deployment workflow in PR `#119`.

Remaining migration work should happen in the new central docs repository and follow the backlog tasks above.
