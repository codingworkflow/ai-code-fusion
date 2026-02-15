jest.unmock('fs');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PNG } = require('pngjs');

const {
  compareUiBaselineArtifacts,
  resolveThresholds,
} = require('../../../scripts/compare-ui-baseline');
const {
  evaluateDriftStatus,
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
});

describe('compare-ui-baseline integration paths', () => {
  test('compareUiBaselineArtifacts returns skipped when baseline is unavailable', () => {
    const report = compareUiBaselineArtifacts({
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

  test('compareUiBaselineArtifacts returns pass when screenshots are identical', () => {
    const baselineRoot = createTemporaryDirectory('ui-baseline-pass-baseline-');
    const currentRoot = createTemporaryDirectory('ui-baseline-pass-current-');
    const diffRoot = createTemporaryDirectory('ui-baseline-pass-diff-');

    try {
      const baselineRunRoot = path.join(baselineRoot, '777');
      fs.mkdirSync(baselineRunRoot, { recursive: true });
      writeArtifactSet(baselineRunRoot, {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      });
      writeArtifactSet(currentRoot, {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      });

      const report = compareUiBaselineArtifacts({
        baselineArtifactsRoot: baselineRoot,
        baselineSelection: {
          selectedRun: {
            headSha: 'baseline-pass-sha',
            id: 777,
          },
          status: 'selected',
        },
        currentArtifactsRoot: currentRoot,
        diffOutputDirectory: diffRoot,
        failThresholdPct: 50,
        pixelmatchThreshold: 0,
        warnThresholdPct: 10,
      });

      expect(report.summary.status).toBe('pass');
      expect(report.summary.comparedImages).toBe(3);
      expect(report.pixelTotals.aggregateDriftPct).toBe(0);
      expect(report.comparisons.every((comparison) => comparison.status === 'pass')).toBe(true);
    } finally {
      fs.rmSync(baselineRoot, { force: true, recursive: true });
      fs.rmSync(currentRoot, { force: true, recursive: true });
      fs.rmSync(diffRoot, { force: true, recursive: true });
    }
  });

  test('compareUiBaselineArtifacts returns warn when drift exceeds warn threshold only', () => {
    const baselineRoot = createTemporaryDirectory('ui-baseline-warn-baseline-');
    const currentRoot = createTemporaryDirectory('ui-baseline-warn-current-');
    const diffRoot = createTemporaryDirectory('ui-baseline-warn-diff-');

    try {
      const baselineRunRoot = path.join(baselineRoot, '888');
      fs.mkdirSync(baselineRunRoot, { recursive: true });
      writeArtifactSet(baselineRunRoot, {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      });
      writeArtifactSet(currentRoot, {
        linux: onePixelChangedImage(),
        macos: blackImage(),
        windows: blackImage(),
      });

      const report = compareUiBaselineArtifacts({
        baselineArtifactsRoot: baselineRoot,
        baselineSelection: {
          selectedRun: {
            headSha: 'baseline-warn-sha',
            id: 888,
          },
          status: 'selected',
        },
        currentArtifactsRoot: currentRoot,
        diffOutputDirectory: diffRoot,
        failThresholdPct: 50,
        pixelmatchThreshold: 0,
        warnThresholdPct: 10,
      });

      expect(report.summary.status).toBe('warn');
      expect(report.summary.warningComparisons).toBe(1);
      expect(report.summary.failingComparisons).toBe(0);
      expect(report.comparisons.find((comparison) => comparison.os === 'linux').status).toBe(
        'warn'
      );
    } finally {
      fs.rmSync(baselineRoot, { force: true, recursive: true });
      fs.rmSync(currentRoot, { force: true, recursive: true });
      fs.rmSync(diffRoot, { force: true, recursive: true });
    }
  });

  test('compareUiBaselineArtifacts returns fail when drift exceeds fail threshold', () => {
    const baselineRoot = createTemporaryDirectory('ui-baseline-fail-baseline-');
    const currentRoot = createTemporaryDirectory('ui-baseline-fail-current-');
    const diffRoot = createTemporaryDirectory('ui-baseline-fail-diff-');

    try {
      const baselineRunRoot = path.join(baselineRoot, '999');
      fs.mkdirSync(baselineRunRoot, { recursive: true });
      writeArtifactSet(baselineRunRoot, {
        linux: blackImage(),
        macos: blackImage(),
        windows: blackImage(),
      });
      writeArtifactSet(currentRoot, {
        linux: allPixelsChangedImage(),
        macos: blackImage(),
        windows: blackImage(),
      });

      const report = compareUiBaselineArtifacts({
        baselineArtifactsRoot: baselineRoot,
        baselineSelection: {
          selectedRun: {
            headSha: 'baseline-fail-sha',
            id: 999,
          },
          status: 'selected',
        },
        currentArtifactsRoot: currentRoot,
        diffOutputDirectory: diffRoot,
        failThresholdPct: 50,
        pixelmatchThreshold: 0,
        warnThresholdPct: 10,
      });

      expect(report.summary.status).toBe('fail');
      expect(report.summary.failingComparisons).toBe(1);
      expect(report.comparisons.find((comparison) => comparison.os === 'linux').status).toBe(
        'fail'
      );
    } finally {
      fs.rmSync(baselineRoot, { force: true, recursive: true });
      fs.rmSync(currentRoot, { force: true, recursive: true });
      fs.rmSync(diffRoot, { force: true, recursive: true });
    }
  });
});
