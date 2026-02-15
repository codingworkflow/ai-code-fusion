const {
  REQUIRED_BASELINE_ARTIFACTS,
  buildExcludedHeadShas,
  selectBaselineRun,
} = require('../../../scripts/lib/ui-baseline-selection');
const { selectBaselineFromGitHub } = require('../../../scripts/select-qa-baseline');

describe('ui baseline selection helpers', () => {
  test('selectBaselineRun chooses the first valid candidate in the run window', () => {
    const selection = selectBaselineRun({
      currentRunId: 300,
      excludedHeadShas: buildExcludedHeadShas({
        currentSha: 'merge-sha',
        pullRequestHeadSha: 'head-sha',
      }),
      maxCandidateRuns: 3,
      requiredArtifacts: REQUIRED_BASELINE_ARTIFACTS,
      runArtifactsByRunId: {
        300: REQUIRED_BASELINE_ARTIFACTS,
        299: REQUIRED_BASELINE_ARTIFACTS,
        298: REQUIRED_BASELINE_ARTIFACTS,
      },
      workflowRuns: [
        { createdAt: '2026-02-15T01:00:00Z', headBranch: 'main', headSha: 'merge-sha', id: 300 },
        { createdAt: '2026-02-15T00:50:00Z', headBranch: 'main', headSha: 'head-sha', id: 299 },
        { createdAt: '2026-02-15T00:40:00Z', headBranch: 'main', headSha: 'stable-sha', id: 298 },
      ],
    });

    expect(selection.status).toBe('selected');
    expect(selection.selectedRun).toMatchObject({
      headSha: 'stable-sha',
      id: 298,
    });
    expect(selection.evaluatedRuns.map((run) => run.exclusionReason)).toEqual([
      'current_run_id',
      'excluded_head_sha',
      null,
    ]);
  });

  test('selectBaselineRun respects the 3-run window and skips when no valid baseline exists', () => {
    const selection = selectBaselineRun({
      currentRunId: 600,
      excludedHeadShas: buildExcludedHeadShas({
        currentSha: 'merge-sha',
      }),
      maxCandidateRuns: 3,
      requiredArtifacts: REQUIRED_BASELINE_ARTIFACTS,
      runArtifactsByRunId: {
        600: REQUIRED_BASELINE_ARTIFACTS,
        599: ['ui-screenshot-linux'],
        598: ['ui-screenshot-linux', 'ui-screenshot-windows'],
        597: REQUIRED_BASELINE_ARTIFACTS,
      },
      workflowRuns: [
        { createdAt: '2026-02-15T01:00:00Z', headBranch: 'main', headSha: 'merge-sha', id: 600 },
        {
          createdAt: '2026-02-15T00:50:00Z',
          headBranch: 'main',
          headSha: 'candidate-a',
          id: 599,
        },
        {
          createdAt: '2026-02-15T00:40:00Z',
          headBranch: 'main',
          headSha: 'candidate-b',
          id: 598,
        },
        {
          createdAt: '2026-02-15T00:30:00Z',
          headBranch: 'main',
          headSha: 'candidate-c',
          id: 597,
        },
      ],
    });

    expect(selection.status).toBe('skipped');
    expect(selection.skipReason).toBe('no_valid_baseline');
    expect(selection.evaluatedRuns).toHaveLength(3);
    expect(selection.evaluatedRuns[1].missingArtifacts.length).toBeGreaterThan(0);
    expect(selection.evaluatedRuns[2].missingArtifacts.length).toBeGreaterThan(0);
  });
});

describe('select-qa-baseline dry-run', () => {
  test('selectBaselineFromGitHub evaluates mocked run metadata and selects prior main baseline', async () => {
    const listWorkflowRuns = jest.fn().mockResolvedValue([
      { createdAt: '2026-02-15T01:00:00Z', headBranch: 'main', headSha: 'merge-sha', id: 900 },
      { createdAt: '2026-02-15T00:50:00Z', headBranch: 'main', headSha: 'head-sha', id: 899 },
      {
        createdAt: '2026-02-15T00:40:00Z',
        headBranch: 'main',
        headSha: 'baseline-sha',
        id: 898,
      },
    ]);
    const listRunArtifacts = jest
      .fn()
      .mockResolvedValue(REQUIRED_BASELINE_ARTIFACTS.map((name) => ({ expired: false, name })));

    const selection = await selectBaselineFromGitHub({
      environment: {
        BASELINE_MAX_CANDIDATE_RUNS: '3',
        GITHUB_REPOSITORY: 'codingworkflow/ai-code-fusion',
        GITHUB_RUN_ID: '900',
        GITHUB_SHA: 'merge-sha',
        GITHUB_TOKEN: 'test-token',
      },
      eventPayload: {
        pull_request: {
          head: { sha: 'head-sha' },
          merge_commit_sha: 'merge-sha',
        },
      },
      githubApi: {
        listRunArtifacts,
        listWorkflowRuns,
      },
    });

    expect(listWorkflowRuns).toHaveBeenCalledWith({
      maxCandidateRuns: 3,
      owner: 'codingworkflow',
      repo: 'ai-code-fusion',
      token: 'test-token',
      workflowFile: 'qa-matrix.yml',
    });
    expect(listRunArtifacts).toHaveBeenCalledTimes(1);
    expect(listRunArtifacts).toHaveBeenCalledWith({
      owner: 'codingworkflow',
      repo: 'ai-code-fusion',
      runId: 898,
      token: 'test-token',
    });
    expect(selection.status).toBe('selected');
    expect(selection.selectedRun).toMatchObject({
      headSha: 'baseline-sha',
      id: 898,
    });
  });
});
