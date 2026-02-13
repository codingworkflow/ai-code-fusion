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
const DEFAULT_TRACKING_PULL_REQUEST_TITLE = 'CI: refresh pinned GitHub Actions SHAs';
const DEFAULT_TRACKING_PULL_REQUEST_BRANCH = 'automation/actions-freshness-tracker';
const DEFAULT_TRACKING_PULL_REQUEST_FILE_PATH = '.github/actions-freshness-tracker.md';
const TRACKING_PULL_REQUEST_MARKER = '<!-- actions-freshness-tracker -->';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function parseArguments(argv) {
  const options = {
    reportPath: DEFAULT_REPORT_PATH,
    jsonPath: DEFAULT_JSON_PATH,
    workflowDirectory: DEFAULT_WORKFLOW_DIRECTORY,
    failOnStale: false,
    managePullRequest: false,
    pullRequestTitle: DEFAULT_TRACKING_PULL_REQUEST_TITLE,
    pullRequestBranch: DEFAULT_TRACKING_PULL_REQUEST_BRANCH,
    pullRequestFilePath: DEFAULT_TRACKING_PULL_REQUEST_FILE_PATH,
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

    if (argument === '--issue-title' || argument === '--pr-title') {
      options.pullRequestTitle = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--fail-on-stale') {
      options.failOnStale = true;
      continue;
    }

    if (argument === '--pr-branch') {
      options.pullRequestBranch = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--pr-file-path') {
      options.pullRequestFilePath = argv[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--manage-issue' || argument === '--manage-pr') {
      options.managePullRequest = true;
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

  if (!options.pullRequestTitle) {
    throw new Error('The --pr-title/--issue-title option requires a value.');
  }

  if (!options.pullRequestBranch) {
    throw new Error('The --pr-branch option requires a value.');
  }

  if (!options.pullRequestFilePath) {
    throw new Error('The --pr-file-path option requires a value.');
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

function toGitHubRefPath(value) {
  return value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function toGitHubContentPath(filePath) {
  return filePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function getRepositoryMetadata({ owner, repository, token }) {
  return githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    token,
  });
}

async function ensureTrackingPullRequestBranch({
  owner,
  repository,
  token,
  defaultBranch,
  trackingBranch,
}) {
  const defaultBranchRef = await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/ref/heads/${toGitHubRefPath(defaultBranch)}`,
    token,
  });
  const defaultBranchSha = defaultBranchRef && defaultBranchRef.object ? defaultBranchRef.object.sha : '';
  if (!defaultBranchSha) {
    throw new Error(`Could not resolve latest commit on ${defaultBranch}.`);
  }

  try {
    await githubRequest({
      endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/ref/heads/${toGitHubRefPath(trackingBranch)}`,
      token,
    });
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }

    await githubRequest({
      endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/refs`,
      token,
      method: 'POST',
      body: {
        ref: `refs/heads/${trackingBranch}`,
        sha: defaultBranchSha,
      },
    });
    console.log(`[actions-freshness] Created branch ${trackingBranch}`);
  }
}

async function upsertTrackingPullRequestFile({
  owner,
  repository,
  token,
  trackingBranch,
  filePath,
  content,
}) {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${toGitHubContentPath(filePath)}`;
  let existingSha = '';

  try {
    const existingFile = await githubRequest({
      endpoint: `${endpoint}?ref=${encodeURIComponent(trackingBranch)}`,
      token,
    });
    if (existingFile && typeof existingFile === 'object' && existingFile.sha) {
      existingSha = existingFile.sha;
    }
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  const payload = {
    message: 'chore(ci): refresh actions freshness tracker',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: trackingBranch,
  };

  if (existingSha) {
    payload.sha = existingSha;
  }

  await githubRequest({
    endpoint,
    token,
    method: 'PUT',
    body: payload,
  });
}

async function findTrackingPullRequest({ owner, repository, token, trackingBranch }) {
  const pullRequests = await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls?state=open&head=${encodeURIComponent(`${owner}:${trackingBranch}`)}&per_page=10`,
    token,
  });

  if (!Array.isArray(pullRequests) || pullRequests.length === 0) {
    return null;
  }

  return (
    pullRequests.find(
      (pullRequest) =>
        typeof pullRequest.body === 'string' &&
        pullRequest.body.includes(TRACKING_PULL_REQUEST_MARKER)
    ) || null
  );
}

async function closeTrackingPullRequest({ owner, repository, pullRequestNumber, token }) {
  await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${pullRequestNumber}`,
    token,
    method: 'PATCH',
    body: {
      state: 'closed',
    },
  });
}

async function upsertTrackingPullRequest({
  token,
  owner,
  repository,
  pullRequestTitle,
  pullRequestBranch,
  pullRequestFilePath,
  staleCount,
  resolutionErrorCount,
  reportMarkdown,
}) {
  const trackingPullRequest = await findTrackingPullRequest({
    owner,
    repository,
    token,
    trackingBranch: pullRequestBranch,
  });
  const body = `${TRACKING_PULL_REQUEST_MARKER}\n\n${reportMarkdown}`;
  const hasFindings = staleCount > 0 || resolutionErrorCount > 0;

  if (!hasFindings) {
    if (!trackingPullRequest) {
      return;
    }

    await closeTrackingPullRequest({
      owner,
      repository,
      pullRequestNumber: trackingPullRequest.number,
      token,
    });
    console.log(`[actions-freshness] Closed pull request #${trackingPullRequest.number}`);
    return;
  }

  const repositoryMetadata = await getRepositoryMetadata({ owner, repository, token });
  const defaultBranch = repositoryMetadata && repositoryMetadata.default_branch;
  if (!defaultBranch) {
    throw new Error('Could not resolve repository default branch for tracker pull request.');
  }

  await ensureTrackingPullRequestBranch({
    owner,
    repository,
    token,
    defaultBranch,
    trackingBranch: pullRequestBranch,
  });

  const trackingFileContent = [
    TRACKING_PULL_REQUEST_MARKER,
    '',
    '# Actions Freshness Tracker',
    '',
    `Last updated: ${new Date().toISOString()}`,
    '',
    reportMarkdown,
    '',
  ].join('\n');

  await upsertTrackingPullRequestFile({
    owner,
    repository,
    token,
    trackingBranch: pullRequestBranch,
    filePath: pullRequestFilePath,
    content: trackingFileContent,
  });

  if (trackingPullRequest) {
    await githubRequest({
      endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls/${trackingPullRequest.number}`,
      token,
      method: 'PATCH',
      body: {
        title: pullRequestTitle,
        body,
      },
    });
    console.log(`[actions-freshness] Updated pull request #${trackingPullRequest.number}`);
    return;
  }

  const createdPullRequest = await githubRequest({
    endpoint: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pulls`,
    token,
    method: 'POST',
    body: {
      title: pullRequestTitle,
      head: pullRequestBranch,
      base: defaultBranch,
      body,
      draft: true,
    },
  });
  console.log(`[actions-freshness] Created draft pull request #${createdPullRequest.number}`);
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

function appendStepSummaryWarning(warningMessage) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `\n> [!WARNING]\n> ${warningMessage}\n`);
}

function isPullRequestTrackerPermissionError(error) {
  if (!error || typeof error.message !== 'string') {
    return false;
  }

  return (
    error.status === 403 &&
    error.message.includes('GitHub Actions is not permitted to create or approve pull requests')
  );
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

  if (options.managePullRequest) {
    if (!token) {
      throw new Error(
        'Tracker pull request management requested, but GITHUB_TOKEN/GH_TOKEN is not set.'
      );
    }

    const repositoryMetadata = parseRepositoryFromEnvironment();
    if (!repositoryMetadata) {
      throw new Error(
        'Tracker pull request management requested, but GITHUB_REPOSITORY is not set to owner/repository.'
      );
    }

    try {
      await upsertTrackingPullRequest({
        token,
        owner: repositoryMetadata.owner,
        repository: repositoryMetadata.repository,
        pullRequestTitle: options.pullRequestTitle,
        pullRequestBranch: options.pullRequestBranch,
        pullRequestFilePath: options.pullRequestFilePath,
        staleCount: jsonReport.staleCount,
        resolutionErrorCount: jsonReport.resolutionErrors.length,
        reportMarkdown: markdownReport,
      });
    } catch (error) {
      if (!isPullRequestTrackerPermissionError(error)) {
        throw error;
      }

      const warningMessage =
        'Could not manage actions freshness tracker PR because GitHub Actions is not allowed to create pull requests. Enable this in repository Settings > Actions > General > Workflow permissions.';
      console.warn(`[actions-freshness] ${warningMessage}`);
      appendStepSummaryWarning(warningMessage);
    }
  }

  if (options.failOnStale && jsonReport.staleCount > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`[actions-freshness] ${error.message}`);
  process.exit(1);
});
