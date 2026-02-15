const path = require('path');
const {
  REQUIRED_BASELINE_ARTIFACTS,
  buildExcludedHeadShas,
  selectBaselineRun,
} = require('../../../scripts/lib/ui-baseline-selection');
const {
  parseMaxCandidateRuns,
  parseRequiredArtifacts,
  resolvePathInsideRoot,
  selectBaselineFromGitHub,
} = require('../../../scripts/select-qa-baseline');

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
  test('selectBaselineFromGitHub fails when GitHub token is missing', async () => {
    await expect(
      selectBaselineFromGitHub({
        environment: {
          GITHUB_REPOSITORY: 'codingworkflow/ai-code-fusion',
          GITHUB_RUN_ID: '900',
          GITHUB_SHA: 'merge-sha',
        },
        eventPayload: {},
      })
    ).rejects.toThrow('GITHUB_TOKEN (or GH_TOKEN) is required for baseline selection');
  });

  test('parseMaxCandidateRuns falls back to default for invalid values', () => {
    expect(parseMaxCandidateRuns({ BASELINE_MAX_CANDIDATE_RUNS: '0' })).toBe(3);
    expect(parseMaxCandidateRuns({ BASELINE_MAX_CANDIDATE_RUNS: '-4' })).toBe(3);
    expect(parseMaxCandidateRuns({ BASELINE_MAX_CANDIDATE_RUNS: 'not-a-number' })).toBe(3);
    expect(parseMaxCandidateRuns({ BASELINE_MAX_CANDIDATE_RUNS: '4.9' })).toBe(4);
    expect(parseMaxCandidateRuns({ BASELINE_MAX_CANDIDATE_RUNS: '250' })).toBe(100);
  });

  test('parseRequiredArtifacts rejects explicitly empty variable values', () => {
    expect(() =>
      parseRequiredArtifacts({
        BASELINE_REQUIRED_ARTIFACTS: '   ',
      })
    ).toThrow('BASELINE_REQUIRED_ARTIFACTS must not be empty when the variable is configured');
  });

  test('parseRequiredArtifacts uses defaults when variable is not configured', () => {
    expect(parseRequiredArtifacts({})).toEqual(REQUIRED_BASELINE_ARTIFACTS);
  });

  test('resolvePathInsideRoot rejects output paths outside repository root', () => {
    expect(() =>
      resolvePathInsideRoot(
        '../outside/baseline-selection.json',
        'dist/qa/baseline-selection.json',
        'BASELINE_SELECTION_OUTPUT_PATH'
      )
    ).toThrow('BASELINE_SELECTION_OUTPUT_PATH must resolve inside the repository root');
  });

  test('resolvePathInsideRoot allows relative output paths inside repository root', () => {
    const resolvedPath = resolvePathInsideRoot(
      'dist/qa/custom-baseline-selection.json',
      'dist/qa/baseline-selection.json',
      'BASELINE_SELECTION_OUTPUT_PATH'
    );

    expect(
      resolvedPath.endsWith(path.join('dist', 'qa', 'custom-baseline-selection.json'))
    ).toBe(true);
  });

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
