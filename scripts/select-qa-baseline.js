#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  DEFAULT_MAX_CANDIDATE_RUNS,
  REQUIRED_BASELINE_ARTIFACTS,
  buildExcludedHeadShas,
  normalizeWorkflowRuns,
  resolveBaselineSelection,
} = require('./lib/ui-baseline-selection');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, 'dist', 'qa', 'baseline-selection.json');
const DEFAULT_WORKFLOW_FILE = 'qa-matrix.yml';

function ensureDirectoryForFile(filePath) {
  const directoryPath = path.dirname(filePath);
  fs.mkdirSync(directoryPath, { recursive: true });
}

function parseRepositoryFromEnvironment(environment = process.env) {
  const repositoryValue = String(environment.GITHUB_REPOSITORY || '').trim();
  const [owner, repo] = repositoryValue.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repositoryValue || '<empty>'}`);
  }

  return {
    owner,
    repo,
  };
}

function parseGitHubEventPayload(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath || !fs.existsSync(eventPath)) {
    return {};
  }

  const eventContent = fs.readFileSync(eventPath, 'utf8');
  return JSON.parse(eventContent);
}

function resolveExcludedShas(environment = process.env, eventPayload = {}) {
  const pullRequest = eventPayload.pull_request || {};

  return buildExcludedHeadShas({
    currentSha: environment.GITHUB_SHA,
    pullRequestHeadSha: pullRequest?.head?.sha || null,
    pullRequestMergeSha: pullRequest?.merge_commit_sha || null,
  });
}

function parseRequiredArtifacts(environment = process.env) {
  const hasConfiguredArtifacts = Object.prototype.hasOwnProperty.call(
    environment,
    'BASELINE_REQUIRED_ARTIFACTS'
  );
  const rawArtifacts = String(environment.BASELINE_REQUIRED_ARTIFACTS || '').trim();
  if (rawArtifacts.length === 0 && !hasConfiguredArtifacts) {
    return [...REQUIRED_BASELINE_ARTIFACTS];
  }
  if (rawArtifacts.length === 0 && hasConfiguredArtifacts) {
    throw new Error(
      'BASELINE_REQUIRED_ARTIFACTS must not be empty when the variable is configured'
    );
  }

  const parsedArtifacts = rawArtifacts
    .split(',')
    .map((artifactName) => artifactName.trim())
    .filter((artifactName) => artifactName.length > 0);
  if (parsedArtifacts.length === 0) {
    throw new Error('BASELINE_REQUIRED_ARTIFACTS must contain at least one artifact name');
  }

  return parsedArtifacts;
}

function parseMaxCandidateRuns(environment = process.env) {
  const rawValue = Number(environment.BASELINE_MAX_CANDIDATE_RUNS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_MAX_CANDIDATE_RUNS;
  }

  return Math.floor(rawValue);
}

async function githubRequest({ endpoint, token, method = 'GET' }) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18+ to run this script.');
  }

  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'qa-baseline-selector',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    method,
  });
  const bodyText = await response.text();
  let body = {};
  if (bodyText.length > 0) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = {};
    }
  }

  if (!response.ok) {
    const message = body?.message || bodyText || 'Unknown GitHub API failure';
    throw new Error(`GitHub API ${method} ${endpoint} failed (${response.status}): ${message}`);
  }

  return body;
}

async function listWorkflowRuns({ owner, repo, token, workflowFile, maxCandidateRuns }) {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/actions/workflows/${encodeURIComponent(
    workflowFile
  )}/runs?branch=main&status=success&per_page=${maxCandidateRuns}`;
  const payload = await githubRequest({
    endpoint,
    token,
  });

  return normalizeWorkflowRuns(payload.workflow_runs || []);
}

async function listRunArtifacts({ owner, repo, runId, token }) {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/actions/runs/${encodeURIComponent(runId)}/artifacts?per_page=100`;
  const payload = await githubRequest({
    endpoint,
    token,
  });

  return Array.isArray(payload.artifacts) ? payload.artifacts : [];
}

function writeSelectionSummary(selectionSummary, outputPath) {
  const resolvedPath = path.resolve(outputPath);
  ensureDirectoryForFile(resolvedPath);
  fs.writeFileSync(resolvedPath, `${JSON.stringify(selectionSummary, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

function setGitHubOutput(name, value) {
  const outputFilePath = process.env.GITHUB_OUTPUT;
  if (!outputFilePath) {
    return;
  }

  const normalizedValue = value == null ? '' : String(value);
  fs.appendFileSync(outputFilePath, `${name}=${normalizedValue}\n`, 'utf8');
}

function emitSelectionOutputs(selectionResult) {
  setGitHubOutput('status', selectionResult.status);
  setGitHubOutput(
    'baseline_run_id',
    selectionResult.selectedRun ? selectionResult.selectedRun.id : ''
  );
  setGitHubOutput(
    'baseline_head_sha',
    selectionResult.selectedRun ? selectionResult.selectedRun.headSha : ''
  );
  setGitHubOutput(
    'baseline_created_at',
    selectionResult.selectedRun ? selectionResult.selectedRun.createdAt : ''
  );
  setGitHubOutput('baseline_skip_reason', selectionResult.skipReason || '');
}

async function selectBaselineFromGitHub({
  environment = process.env,
  eventPayload = parseGitHubEventPayload(environment.GITHUB_EVENT_PATH),
  githubApi = {
    listRunArtifacts,
    listWorkflowRuns,
  },
} = {}) {
  const token = String(environment.GITHUB_TOKEN || environment.GH_TOKEN || '').trim();
  if (!token) {
    throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required for baseline selection');
  }

  const { owner, repo } = parseRepositoryFromEnvironment(environment);
  const currentRunId = Number(environment.GITHUB_RUN_ID || 0);
  const maxCandidateRuns = parseMaxCandidateRuns(environment);
  const requiredArtifacts = parseRequiredArtifacts(environment);
  const excludedHeadShas = resolveExcludedShas(environment, eventPayload);
  const workflowFile = String(environment.BASELINE_WORKFLOW_FILE || DEFAULT_WORKFLOW_FILE).trim();

  const workflowRuns = await githubApi.listWorkflowRuns({
    maxCandidateRuns,
    owner,
    repo,
    token,
    workflowFile,
  });

  const selectionResult = await resolveBaselineSelection({
    currentRunId,
    excludedHeadShas,
    listRunArtifacts: async (runId) =>
      githubApi.listRunArtifacts({
        owner,
        repo,
        runId,
        token,
      }),
    maxCandidateRuns,
    requiredArtifacts,
    workflowRuns,
  });

  return {
    ...selectionResult,
    maxCandidateRuns,
    requiredArtifacts,
    workflowFile,
    workflowRuns,
  };
}

async function main() {
  const selectionResult = await selectBaselineFromGitHub();
  const outputPath = path.resolve(
    process.env.BASELINE_SELECTION_OUTPUT_PATH || DEFAULT_OUTPUT_PATH
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    maxCandidateRuns: selectionResult.maxCandidateRuns,
    requiredArtifacts: selectionResult.requiredArtifacts,
    selectedRun: selectionResult.selectedRun,
    skipReason: selectionResult.skipReason,
    status: selectionResult.status,
    workflowFile: selectionResult.workflowFile,
    workflowRuns: selectionResult.workflowRuns,
    evaluatedRuns: selectionResult.evaluatedRuns,
  };

  const writtenPath = writeSelectionSummary(summary, outputPath);
  emitSelectionOutputs(selectionResult);
  console.log(
    `UI baseline selection completed with status="${selectionResult.status}". Summary: ${writtenPath}`
  );
  if (selectionResult.selectedRun) {
    console.log(
      `Selected baseline run ${selectionResult.selectedRun.id} (${selectionResult.selectedRun.headSha})`
    );
  } else {
    console.log(`No baseline selected. Reason: ${selectionResult.skipReason}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to select UI baseline:', error);
    process.exit(1);
  });
}

module.exports = {
  parseGitHubEventPayload,
  parseMaxCandidateRuns,
  parseRepositoryFromEnvironment,
  parseRequiredArtifacts,
  resolveExcludedShas,
  selectBaselineFromGitHub,
};
