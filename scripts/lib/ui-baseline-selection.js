const DEFAULT_MAX_CANDIDATE_RUNS = 3;
const REQUIRED_BASELINE_ARTIFACTS = Object.freeze([
  'ui-screenshot-linux',
  'ui-screenshot-windows',
  'ui-screenshot-macos',
  'ui-screenshot-manifest-linux',
  'ui-screenshot-manifest-windows',
  'ui-screenshot-manifest-macos',
]);

function normalizeSha(rawValue) {
  return String(rawValue || '')
    .trim()
    .toLowerCase();
}

function normalizeRunId(rawValue) {
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeWorkflowRun(rawRun) {
  return {
    createdAt: rawRun?.createdAt || rawRun?.created_at || null,
    headBranch: rawRun?.headBranch || rawRun?.head_branch || null,
    headSha: rawRun?.headSha || rawRun?.head_sha || null,
    id: normalizeRunId(rawRun?.id),
    runUrl: rawRun?.runUrl || rawRun?.html_url || null,
  };
}

function normalizeWorkflowRuns(rawRuns) {
  if (!Array.isArray(rawRuns)) {
    return [];
  }

  return rawRuns
    .map((rawRun) => normalizeWorkflowRun(rawRun))
    .filter((run) => run.id !== null)
    .sort((leftRun, rightRun) => rightRun.id - leftRun.id);
}

function normalizeArtifacts(rawArtifacts) {
  if (!Array.isArray(rawArtifacts)) {
    return [];
  }

  return rawArtifacts
    .map((rawArtifact) => {
      if (typeof rawArtifact === 'string') {
        return {
          expired: false,
          name: rawArtifact,
        };
      }

      return {
        expired: Boolean(rawArtifact?.expired),
        name: rawArtifact?.name ? String(rawArtifact.name) : '',
      };
    })
    .filter((artifact) => artifact.name.length > 0);
}

function buildExcludedHeadShas({
  currentSha = null,
  pullRequestHeadSha = null,
  pullRequestMergeSha = null,
} = {}) {
  const normalizedShas = [currentSha, pullRequestHeadSha, pullRequestMergeSha]
    .map((candidateSha) => normalizeSha(candidateSha))
    .filter((candidateSha) => candidateSha.length > 0);
  return new Set(normalizedShas);
}

function toArtifactSet(rawArtifacts) {
  return new Set(
    normalizeArtifacts(rawArtifacts)
      .filter((artifact) => !artifact.expired)
      .map((artifact) => artifact.name)
  );
}

function collectMissingArtifacts(availableArtifacts, requiredArtifacts) {
  return requiredArtifacts.filter((artifactName) => !availableArtifacts.has(artifactName));
}

function evaluateRun({
  currentRunId,
  excludedHeadShas,
  requiredArtifacts,
  run,
  runArtifactsByRunId,
}) {
  const normalizedHeadSha = normalizeSha(run.headSha);
  const artifactSet = toArtifactSet(runArtifactsByRunId[run.id] || []);
  const missingArtifacts = collectMissingArtifacts(artifactSet, requiredArtifacts);

  let exclusionReason = null;
  if (run.id === currentRunId) {
    exclusionReason = 'current_run_id';
  } else if (run.headBranch !== 'main') {
    exclusionReason = 'not_main_branch';
  } else if (excludedHeadShas.has(normalizedHeadSha)) {
    exclusionReason = 'excluded_head_sha';
  } else if (missingArtifacts.length > 0) {
    exclusionReason = 'missing_required_artifacts';
  }

  return {
    availableArtifacts: Array.from(artifactSet).sort((left, right) => left.localeCompare(right)),
    createdAt: run.createdAt,
    exclusionReason,
    headSha: run.headSha,
    id: run.id,
    missingArtifacts,
    runUrl: run.runUrl,
  };
}

function selectBaselineRun({
  currentRunId,
  excludedHeadShas,
  maxCandidateRuns = DEFAULT_MAX_CANDIDATE_RUNS,
  requiredArtifacts = REQUIRED_BASELINE_ARTIFACTS,
  runArtifactsByRunId,
  workflowRuns,
}) {
  const normalizedRuns = normalizeWorkflowRuns(workflowRuns).slice(
    0,
    Math.max(1, Number(maxCandidateRuns) || DEFAULT_MAX_CANDIDATE_RUNS)
  );
  const evaluations = normalizedRuns.map((run) =>
    evaluateRun({
      currentRunId,
      excludedHeadShas,
      requiredArtifacts,
      run,
      runArtifactsByRunId,
    })
  );

  const selectedRun = evaluations.find((evaluation) => evaluation.exclusionReason === null) || null;
  const skipReason =
    selectedRun !== null
      ? null
      : evaluations.length === 0
        ? 'no_successful_main_runs'
        : 'no_valid_baseline';

  return {
    evaluatedRuns: evaluations,
    selectedRun,
    skipReason,
    status: selectedRun === null ? 'skipped' : 'selected',
  };
}

async function resolveBaselineSelection({
  currentRunId,
  excludedHeadShas,
  listRunArtifacts,
  maxCandidateRuns = DEFAULT_MAX_CANDIDATE_RUNS,
  requiredArtifacts = REQUIRED_BASELINE_ARTIFACTS,
  workflowRuns,
}) {
  if (typeof listRunArtifacts !== 'function') {
    throw new Error('resolveBaselineSelection requires a listRunArtifacts function');
  }

  const normalizedRuns = normalizeWorkflowRuns(workflowRuns).slice(
    0,
    Math.max(1, Number(maxCandidateRuns) || DEFAULT_MAX_CANDIDATE_RUNS)
  );
  const runArtifactsByRunId = {};

  for (const run of normalizedRuns) {
    const shouldSkipArtifactsLookup =
      run.id === currentRunId ||
      run.headBranch !== 'main' ||
      excludedHeadShas.has(normalizeSha(run.headSha));
    if (shouldSkipArtifactsLookup) {
      runArtifactsByRunId[run.id] = [];
      continue;
    }

    runArtifactsByRunId[run.id] = await listRunArtifacts(run.id);
  }

  return selectBaselineRun({
    currentRunId,
    excludedHeadShas,
    maxCandidateRuns,
    requiredArtifacts,
    runArtifactsByRunId,
    workflowRuns: normalizedRuns,
  });
}

module.exports = {
  DEFAULT_MAX_CANDIDATE_RUNS,
  REQUIRED_BASELINE_ARTIFACTS,
  buildExcludedHeadShas,
  normalizeWorkflowRun,
  normalizeWorkflowRuns,
  resolveBaselineSelection,
  selectBaselineRun,
};
