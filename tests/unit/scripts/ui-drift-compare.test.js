jest.unmock('fs');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');

const {
  compareUiBaselineArtifacts,
  normalizeBaselineRunId,
  readSelectionSummary,
  resolveThresholds,
  setGitHubOutput,
} = require('../../../scripts/compare-ui-baseline');
const {
  evaluateDriftStatus,
  sortByOsAndFile,
  summarizeDriftComparisons,
} = require('../../../scripts/lib/ui-drift-compare');

function createTemporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createPng(filePath, pixels) {
  const height = pixels.length;
  const width = pixels[0].length;
  const image = new PNG({ height, width });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (width * y + x) << 2;
      const [red, green, blue, alpha] = pixels[y][x];
      image.data[offset] = red;
      image.data[offset + 1] = green;
      image.data[offset + 2] = blue;
      image.data[offset + 3] = alpha;
    }
  }

  fs.writeFileSync(filePath, PNG.sync.write(image));
}

function writeManifest(rootDirectory, artifactOs, screenshotFileName) {
  const manifestDirectory = path.join(rootDirectory, `ui-screenshot-manifest-${artifactOs}`);
  fs.mkdirSync(manifestDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDirectory, 'baseline-manifest.json'),
    `${JSON.stringify(
      {
        os: artifactOs,
        screenshotFiles: [screenshotFileName],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function writeScreenshot(rootDirectory, artifactOs, screenshotFileName, pixels) {
  const screenshotDirectory = path.join(rootDirectory, `ui-screenshot-${artifactOs}`);
  fs.mkdirSync(screenshotDirectory, { recursive: true });
  createPng(path.join(screenshotDirectory, screenshotFileName), pixels);
}

function writeArtifactSet(rootDirectory, imageMapByOs) {
  for (const artifactOs of ['linux', 'windows', 'macos']) {
    const screenshotFileName = `ui-${artifactOs}.png`;
    writeManifest(rootDirectory, artifactOs, screenshotFileName);
    writeScreenshot(rootDirectory, artifactOs, screenshotFileName, imageMapByOs[artifactOs]);
  }
}

function blackImage() {
  return [
    [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ],
    [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ],
  ];
}

function onePixelChangedImage() {
  return [
    [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ],
    [
      [0, 0, 0, 255],
      [0, 0, 0, 255],
    ],
  ];
}

function allPixelsChangedImage() {
  return [
    [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ],
    [
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ],
  ];
}

async function runComparisonScenario({
  baselineImageMap,
  currentImageMap,
  runId,
  runSha,
  temporaryDirectoryPrefix,
}) {
  const baselineRoot = createTemporaryDirectory(`${temporaryDirectoryPrefix}-baseline-`);
  const currentRoot = createTemporaryDirectory(`${temporaryDirectoryPrefix}-current-`);
  const diffRoot = createTemporaryDirectory(`${temporaryDirectoryPrefix}-diff-`);

  try {
    const baselineRunRoot = path.join(baselineRoot, String(runId));
    fs.mkdirSync(baselineRunRoot, { recursive: true });
    writeArtifactSet(baselineRunRoot, baselineImageMap);
    writeArtifactSet(currentRoot, currentImageMap);

    return await compareUiBaselineArtifacts({
      baselineArtifactsRoot: baselineRoot,
      baselineSelection: {
        selectedRun: {
          headSha: runSha,
          id: runId,
        },
        status: 'selected',
      },
      currentArtifactsRoot: currentRoot,
      diffOutputDirectory: diffRoot,
      failThresholdPct: 50,
      pixelmatchThreshold: 0,
      warnThresholdPct: 10,
    });
  } finally {
    fs.rmSync(baselineRoot, { force: true, recursive: true });
    fs.rmSync(currentRoot, { force: true, recursive: true });
    fs.rmSync(diffRoot, { force: true, recursive: true });
  }
}

describe('ui drift compare helpers', () => {
  test('evaluateDriftStatus follows pass/warn/fail thresholds', () => {
    expect(
      evaluateDriftStatus({
        driftPercent: 0,
        failThresholdPct: 50,
        warnThresholdPct: 10,
      })
    ).toBe('pass');
    expect(
      evaluateDriftStatus({
        driftPercent: 25,
        failThresholdPct: 50,
        warnThresholdPct: 10,
      })
    ).toBe('warn');
    expect(
      evaluateDriftStatus({
        driftPercent: 75,
        failThresholdPct: 50,
        warnThresholdPct: 10,
      })
    ).toBe('fail');
  });

  test('summarizeDriftComparisons marks artifact gaps as fail', () => {
    const summary = summarizeDriftComparisons({
      comparisons: [],
      failThresholdPct: 50,
      missingArtifacts: [{ artifactName: 'ui-screenshot-linux', os: 'linux' }],
      warnThresholdPct: 10,
    });

    expect(summary.summary.status).toBe('fail');
    expect(summary.summary.missingArtifactsCount).toBe(1);
  });

  test('resolveThresholds rejects invalid threshold ordering', () => {
    expect(() =>
      resolveThresholds({
        UI_DRIFT_FAIL_THRESHOLD_PCT: '10',
        UI_DRIFT_WARN_THRESHOLD_PCT: '11',
      })
    ).toThrow(
      'UI_DRIFT_WARN_THRESHOLD_PCT must be less than or equal to UI_DRIFT_FAIL_THRESHOLD_PCT'
    );
  });

  test('sortByOsAndFile orders by os then filename', () => {
    const unsortedRecords = [
      { fileName: 'z.png', os: 'windows' },
      { fileName: 'a.png', os: 'linux' },
      { fileName: 'b.png', os: 'linux' },
    ];
    const sortedRecords = [...unsortedRecords].sort(sortByOsAndFile);

    expect(sortedRecords).toEqual([
      { fileName: 'a.png', os: 'linux' },
      { fileName: 'b.png', os: 'linux' },
      { fileName: 'z.png', os: 'windows' },
    ]);
  });

  test('normalizeBaselineRunId accepts positive integer ids only', () => {
    expect(normalizeBaselineRunId('12345')).toBe('12345');
    expect(normalizeBaselineRunId('../12345')).toBeNull();
    expect(normalizeBaselineRunId('0')).toBeNull();
    expect(normalizeBaselineRunId('-1')).toBeNull();
  });

  test('setGitHubOutput writes multiline-safe output format', () => {
    const outputDirectory = createTemporaryDirectory('ui-baseline-github-output-');
    const outputFilePath = path.join(outputDirectory, 'github-output.txt');

    try {
      process.env.GITHUB_OUTPUT = outputFilePath;
      setGitHubOutput('status', 'line-one\nline-two');

      const content = fs.readFileSync(outputFilePath, 'utf8');
      expect(content).toContain('status<<');
      expect(content).toContain('line-one\nline-two');
      expect(content.trim().endsWith('__GITHUB_OUTPUT_EOF__')).toBe(true);
    } finally {
      delete process.env.GITHUB_OUTPUT;
      fs.rmSync(outputDirectory, { force: true, recursive: true });
    }
  });

  test('readSelectionSummary skips when baseline selection json is invalid', () => {
    const outputDirectory = createTemporaryDirectory('ui-baseline-selection-invalid-json-');
    const selectionPath = path.join(outputDirectory, 'baseline-selection.json');

    try {
      fs.writeFileSync(selectionPath, '{"status": "selected"', 'utf8');
      const result = readSelectionSummary(selectionPath);
      expect(result).toEqual({
        skipReason: 'baseline_selection_invalid_json',
        status: 'skipped',
      });
    } finally {
      fs.rmSync(outputDirectory, { force: true, recursive: true });
    }
  });
});

describe('compare-ui-baseline integration paths', () => {
  test('compareUiBaselineArtifacts returns skipped when baseline is unavailable', async () => {
    const report = await compareUiBaselineArtifacts({
      baselineArtifactsRoot: '/unused/baseline',
      baselineSelection: {
        skipReason: 'no_valid_baseline',
        status: 'skipped',
      },
      currentArtifactsRoot: '/unused/current',
      diffOutputDirectory: '/unused/diff',
      failThresholdPct: 50,
      pixelmatchThreshold: 0,
      warnThresholdPct: 10,
    });

    expect(report.summary.status).toBe('skipped');
    expect(report.summary.skipReason).toBe('no_valid_baseline');
  });

  test('compareUiBaselineArtifacts returns pass when screenshots are identical', async () => {
    const report = await runComparisonScenario({
      baselineImageMap: {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      },
      currentImageMap: {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      },
      runId: 777,
      runSha: 'baseline-pass-sha',
      temporaryDirectoryPrefix: 'ui-baseline-pass',
    });

    expect(report.summary.status).toBe('pass');
    expect(report.summary.comparedImages).toBe(3);
    expect(report.pixelTotals.aggregateDriftPct).toBe(0);
    expect(report.comparisons.every((comparison) => comparison.status === 'pass')).toBe(true);
  });

  test('compareUiBaselineArtifacts returns warn when drift exceeds warn threshold only', async () => {
    const report = await runComparisonScenario({
      baselineImageMap: {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      },
      currentImageMap: {
        linux: onePixelChangedImage(),
        macos: blackImage(),
        windows: blackImage(),
      },
      runId: 888,
      runSha: 'baseline-warn-sha',
      temporaryDirectoryPrefix: 'ui-baseline-warn',
    });

    expect(report.summary.status).toBe('warn');
    expect(report.summary.warningComparisons).toBe(1);
    expect(report.summary.failingComparisons).toBe(0);
    expect(report.comparisons.find((comparison) => comparison.os === 'linux').status).toBe('warn');
  });

  test('compareUiBaselineArtifacts returns fail when drift exceeds fail threshold', async () => {
    const report = await runComparisonScenario({
      baselineImageMap: {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      },
      currentImageMap: {
        linux: allPixelsChangedImage(),
        macos: blackImage(),
        windows: blackImage(),
      },
      runId: 999,
      runSha: 'baseline-fail-sha',
      temporaryDirectoryPrefix: 'ui-baseline-fail',
    });

    expect(report.summary.status).toBe('fail');
    expect(report.summary.failingComparisons).toBe(1);
    expect(report.comparisons.find((comparison) => comparison.os === 'linux').status).toBe('fail');
  });

  test('compareUiBaselineArtifacts rejects invalid selected baseline run ids', async () => {
    await expect(
      compareUiBaselineArtifacts({
        baselineArtifactsRoot: '/unused/baseline',
        baselineSelection: {
          selectedRun: {
            headSha: 'baseline-invalid-sha',
            id: '../../etc/passwd',
          },
          status: 'selected',
        },
        currentArtifactsRoot: '/unused/current',
        diffOutputDirectory: '/unused/diff',
        failThresholdPct: 50,
        pixelmatchThreshold: 0,
        warnThresholdPct: 10,
      })
    ).rejects.toThrow('Invalid selected baseline run id');
  });
});
