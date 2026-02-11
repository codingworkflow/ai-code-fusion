#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  buildMarkdownReport,
  collectWorkflowReferences,
  splitReferencesByPinning,
} = require('./lib/actions-freshness');

const DEFAULT_REPORT_PATH = 'actions-freshness-report.md';
const DEFAULT_JSON_PATH = 'actions-freshness-report.json';
const DEFAULT_WORKFLOW_DIRECTORY = path.join('.github', 'workflows');
const DEFAULT_TRACKING_ISSUE_TITLE = 'CI: refresh pinned GitHub Actions SHAs';
const TRACKING_ISSUE_MARKER = '<!-- actions-freshness-tracker -->';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArguments(argv) {
  const options = {
    reportPath: DEFAULT_REPORT_PATH,
    jsonPath: DEFAULT_JSON_PATH,
    workflowDirectory: DEFAULT_WORKFLOW_DIRECTORY,
    failOnStale: false,
    manageIssue: false,
    issueTitle: DEFAULT_TRACKING_ISSUE_TITLE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--report') {
      options.reportPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--json') {
      options.jsonPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--workflow-dir') {
      options.workflowDirectory = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--issue-title') {
      options.issueTitle = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--fail-on-stale') {
      options.failOnStale = true;
      continue;
    }

    if (argument === '--manage-issue') {
      options.manageIssue = true;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  if (!options.reportPath) {
    throw new Error('The --report option requires a value.');
  }

  if (!options.jsonPath) {
    throw new Error('The --json option requires a value.');
  }

  if (!options.workflowDirectory) {
    throw new Error('The --workflow-dir option requires a value.');
  }

  if (!options.issueTitle) {
    throw new Error('The --issue-title option requires a value.');
  }

  return options;
}

function readWorkflowFiles(workflowDirectory) {
  const directoryPath = path.resolve(process.cwd(), workflowDirectory);

  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`Workflow directory not found: ${workflowDirectory}`);
  }

  const entries = fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return entries.map((entryName) => {
    const absolutePath = path.join(directoryPath, entryName);
    const relativePath = toPosixPath(path.relative(process.cwd(), absolutePath));

    return {
      path: relativePath,
      content: fs.readFileSync(absolutePath, 'utf8'),
    };
  });
}

function ensureParentDirectory(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const parentDirectory = path.dirname(absolutePath);

  if (!fs.existsSync(parentDirectory)) {
    fs.mkdirSync(parentDirectory, { recursive: true });
  }

  return absolutePath;
}

function parseRepositoryFromEnvironment() {
  const repository = process.env.GITHUB_REPOSITORY;

  if (!repository || !repository.includes('/')) {
    return null;
  }

  const [owner, name] = repository.split('/');
  if (!owner || !name) {
    return null;
  }

  return { owner, repository: name };
}

async function githubRequest({ endpoint, token, method = 'GET', body = null }) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18+ to run this script.');
  }

  const url = `https://api.github.com${endpoint}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'actions-freshness-audit',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const responseText = await response.text();
  let data = null;

  if (responseText.length > 0) {
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      data = responseText;
    }
  }

  if (!response.ok) {
    const detail = data && typeof data === 'object' && data.message ? data.message : responseText;
    const error = new Error(`GitHub API ${method} ${endpoint} failed (${response.status}): ${detail}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function resolveLatestActionVersion({ owner, repository, token }) {
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

  try {
    const latestRelease = await githubRequest({
      endpoint: `${repositoryPath}/releases/latest`,
      token,
    });
    const releaseTag = latestRelease && latestRelease.tag_name ? latestRelease.tag_name : '';

    if (releaseTag.length > 0) {
      const commit = await githubRequest({
        endpoint: `${repositoryPath}/commits/${encodeURIComponent(releaseTag)}`,
        token,
      });

      if (commit && commit.sha) {
        return {
          latestTag: releaseTag,
          latestSha: commit.sha,
          source: 'release',
        };
      }
    }
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const tags = await githubRequest({
    endpoint: `${repositoryPath}/tags?per_page=1`,
    token,
  });

  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error(`No release tags found for ${owner}/${repository}`);
  }

  const [latestTag] = tags;

  return {
    latestTag: latestTag.name,
    latestSha: latestTag.commit && latestTag.commit.sha ? latestTag.commit.sha : '',
    source: 'tags',
  };
}

function buildRepositoryMap(pinnedReferences) {
  const repositories = new Map();

  for (const reference of pinnedReferences) {
    if (repositories.has(reference.repositoryKey)) {
      continue;
    }

    repositories.set(reference.repositoryKey, {
      owner: reference.owner,
      repository: reference.repository,
      repositoryKey: reference.repositoryKey,
    });
  }

  return repositories;
}

async function resolveRepositoryVersions(pinnedReferences, token) {
  const repositoryMap = buildRepositoryMap(pinnedReferences);
  const resolvedVersions = new Map();
  const errors = [];

  for (const repositoryInfo of repositoryMap.values()) {
    try {
      const version = await resolveLatestActionVersion({
        owner: repositoryInfo.owner,
        repository: repositoryInfo.repository,
        token,
      });

      if (!version.latestSha) {
        throw new Error(
          `Could not resolve latest commit SHA for ${repositoryInfo.owner}/${repositoryInfo.repository}`
        );
      }

      resolvedVersions.set(repositoryInfo.repositoryKey, {
        owner: repositoryInfo.owner,
        repository: repositoryInfo.repository,
        latestTag: version.latestTag,
        latestSha: version.latestSha,
        source: version.source,
      });
    } catch (error) {
      errors.push({
        repository: `${repositoryInfo.owner}/${repositoryInfo.repository}`,
        message: error.message,
      });
    }
  }

  return { resolvedVersions, errors };
}

function collectStaleReferences(pinnedReferences, resolvedVersions) {
  const staleReferences = [];

  for (const reference of pinnedReferences) {
    const latest = resolvedVersions.get(reference.repositoryKey);
    if (!latest || !latest.latestSha) {
      continue;
    }

    if (reference.ref.toLowerCase() === latest.latestSha.toLowerCase()) {
      continue;
    }

    staleReferences.push({
      ...reference,
      latestTag: latest.latestTag,
      latestSha: latest.latestSha,
      latestSource: latest.source,
    });
  }

  return staleReferences;
}

function buildJsonReport({
  workflowCount,
  references,
  pinnedReferences,
  unpinnedReferences,
  staleReferences,
  resolutionErrors,
  resolvedVersions,
}) {
  const generatedAt = new Date().toISOString();
  const latestByRepository = {};

  for (const [repositoryKey, metadata] of resolvedVersions.entries()) {
    latestByRepository[repositoryKey] = {
      latestTag: metadata.latestTag,
      latestSha: metadata.latestSha,
      source: metadata.source,
    };
  }

  return {
    generatedAt,
    workflowCount,
    totalReferences: references.length,
    pinnedCount: pinnedReferences.length,
    unpinnedCount: unpinnedReferences.length,
    staleCount: staleReferences.length,
    staleReferences,
    unpinnedReferences,
    resolutionErrors,
    latestByRepository,
  };
}

async function findTrackingIssue({ owner, repository, token, issueTitle }) {
  for (let page = 1; page <= 5; page += 1) {
    const issues = await githubRequest({
      endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues?state=open&per_page=100&page=${page}`,
      token,
    });

    if (!Array.isArray(issues) || issues.length === 0) {
      return null;
    }

    const trackingIssue = issues.find(
      (issue) =>
        !issue.pull_request &&
        issue.title === issueTitle &&
        typeof issue.body === 'string' &&
        issue.body.includes(TRACKING_ISSUE_MARKER)
    );

    if (trackingIssue) {
      return trackingIssue;
    }

    if (issues.length < 100) {
      break;
    }
  }

  return null;
}

async function closeTrackingIssue({ owner, repository, issueNumber, token }) {
  await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}/comments`,
    token,
    method: 'POST',
    body: {
      body: 'Automated actions freshness audit is clean. Closing this tracker.',
    },
  });

  await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}`,
    token,
    method: 'PATCH',
    body: { state: 'closed' },
  });
}

async function upsertTrackingIssue({
  token,
  owner,
  repository,
  issueTitle,
  staleCount,
  resolutionErrorCount,
  reportMarkdown,
}) {
  const trackingIssue = await findTrackingIssue({
    owner,
    repository,
    token,
    issueTitle,
  });
  const body = `${TRACKING_ISSUE_MARKER}\n\n${reportMarkdown}`;
  const hasFindings = staleCount > 0 || resolutionErrorCount > 0;

  if (!hasFindings) {
    if (!trackingIssue) {
      return;
    }

    await closeTrackingIssue({
      owner,
      repository,
      issueNumber: trackingIssue.number,
      token,
    });
    console.log(`[actions-freshness] Closed issue #${trackingIssue.number}`);
    return;
  }

  if (trackingIssue) {
    await githubRequest({
      endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${trackingIssue.number}`,
      token,
      method: 'PATCH',
      body: {
        title: issueTitle,
        body,
      },
    });
    console.log(`[actions-freshness] Updated issue #${trackingIssue.number}`);
    return;
  }

  const createdIssue = await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues`,
    token,
    method: 'POST',
    body: {
      title: issueTitle,
      body,
    },
  });
  console.log(`[actions-freshness] Created issue #${createdIssue.number}`);
}

function writeReportFiles({ reportPath, jsonPath, markdownReport, jsonReport }) {
  const reportAbsolutePath = ensureParentDirectory(reportPath);
  const jsonAbsolutePath = ensureParentDirectory(jsonPath);

  fs.writeFileSync(reportAbsolutePath, markdownReport, 'utf8');
  fs.writeFileSync(jsonAbsolutePath, JSON.stringify(jsonReport, null, 2), 'utf8');

  return { reportAbsolutePath, jsonAbsolutePath };
}

function writeStepSummary(markdownReport) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `${markdownReport}\n`);
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const workflows = readWorkflowFiles(options.workflowDirectory);
  const references = collectWorkflowReferences(workflows);
  const { pinned: pinnedReferences, unpinned: unpinnedReferences } =
    splitReferencesByPinning(references);

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const { resolvedVersions, errors: resolutionErrors } = await resolveRepositoryVersions(
    pinnedReferences,
    token
  );
  const staleReferences = collectStaleReferences(pinnedReferences, resolvedVersions);

  const jsonReport = buildJsonReport({
    workflowCount: workflows.length,
    references,
    pinnedReferences,
    unpinnedReferences,
    staleReferences,
    resolutionErrors,
    resolvedVersions,
  });
  const markdownReport = buildMarkdownReport(jsonReport);

  const fileOutput = writeReportFiles({
    reportPath: options.reportPath,
    jsonPath: options.jsonPath,
    markdownReport,
    jsonReport,
  });

  writeStepSummary(markdownReport);

  console.log(`[actions-freshness] report: ${fileOutput.reportAbsolutePath}`);
  console.log(`[actions-freshness] json: ${fileOutput.jsonAbsolutePath}`);
  console.log(`[actions-freshness] stale pinned references: ${jsonReport.staleCount}`);

  if (options.manageIssue) {
    if (!token) {
      throw new Error('Issue management requested, but GITHUB_TOKEN/GH_TOKEN is not set.');
    }

    const repositoryMetadata = parseRepositoryFromEnvironment();
    if (!repositoryMetadata) {
      throw new Error(
        'Issue management requested, but GITHUB_REPOSITORY is not set to owner/repository.'
      );
    }

    await upsertTrackingIssue({
      token,
      owner: repositoryMetadata.owner,
      repository: repositoryMetadata.repository,
      issueTitle: options.issueTitle,
      staleCount: jsonReport.staleCount,
      resolutionErrorCount: jsonReport.resolutionErrors.length,
      reportMarkdown: markdownReport,
    });
  }

  if (options.failOnStale && jsonReport.staleCount > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`[actions-freshness] ${error.message}`);
  process.exit(1);
});
