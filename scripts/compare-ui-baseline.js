#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const {
  DEFAULT_FAIL_THRESHOLD_PCT,
  DEFAULT_WARN_THRESHOLD_PCT,
  normalizePercentageThreshold,
  sortByOsAndFile,
  summarizeDriftComparisons,
} = require('./lib/ui-drift-compare');
const { isPathWithinRoot, resolvePathInsideRoot } = require('./select-qa-baseline');

let pixelmatchLoader = null;

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_BASELINE_ARTIFACTS_ROOT = path.join(ROOT_DIR, 'dist', 'qa', 'baseline');
const DEFAULT_BASELINE_SELECTION_PATH = path.join(
  ROOT_DIR,
  'dist',
  'qa',
  'baseline-selection.json'
);
const DEFAULT_CURRENT_ARTIFACTS_ROOT = path.join(ROOT_DIR, 'dist', 'qa', 'current');
const DEFAULT_DIFF_OUTPUT_DIR = path.join(ROOT_DIR, 'dist', 'qa', 'drift-diffs');
const DEFAULT_PIXELMATCH_THRESHOLD = 0.1;
const DEFAULT_REPORT_PATH = path.join(ROOT_DIR, 'dist', 'qa', 'drift-report.json');
const SUPPORTED_ARTIFACT_OSES = ['linux', 'windows', 'macos'];

function isEsmRequireFailure(error) {
  if (!error) {
    return false;
  }

  if (error.code === 'ERR_REQUIRE_ESM') {
    return true;
  }

  const errorMessage = String(error.message || '');
  return (
    errorMessage.includes('Unexpected token') ||
    errorMessage.includes('Cannot use import statement outside a module')
  );
}

function normalizePixelmatchModule(pixelmatchModule) {
  const pixelmatch = pixelmatchModule?.default || pixelmatchModule;
  if (typeof pixelmatch !== 'function') {
    throw new TypeError('Failed to load pixelmatch function');
  }

  return pixelmatch;
}

async function loadPixelmatch() {
  if (!pixelmatchLoader) {
    pixelmatchLoader = (async () => {
      try {
        return normalizePixelmatchModule(require('pixelmatch'));
      } catch (error) {
        if (!isEsmRequireFailure(error)) {
          throw error;
        }
      }

      const pixelmatchModule = await import('pixelmatch');
      return normalizePixelmatchModule(pixelmatchModule);
    })();
  }

  return pixelmatchLoader;
}

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolvePathInsideDirectory(fileName, directoryPath, fieldName) {
  const resolvedPath = path.resolve(directoryPath, fileName);
  const relativePath = path.relative(directoryPath, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`${fieldName} must resolve inside ${directoryPath}: ${fileName}`);
  }

  return resolvedPath;
}

function parseJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function readSelectionSummary(selectionPath) {
  if (!fs.existsSync(selectionPath)) {
    return {
      skipReason: 'baseline_selection_not_found',
      status: 'skipped',
    };
  }

  let summary;
  try {
    summary = parseJsonFile(selectionPath);
  } catch {
    return {
      skipReason: 'baseline_selection_invalid_json',
      status: 'skipped',
    };
  }

  return {
    selectedRun: summary.selectedRun || null,
    skipReason: summary.skipReason || null,
    status: summary.status || 'skipped',
  };
}

function normalizeBaselineRunId(rawValue) {
  const numericValue = Number(rawValue);
  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return String(numericValue);
}

function parsePixelmatchThreshold(environment = process.env) {
  const rawThreshold = String(environment.UI_DRIFT_PIXELMATCH_THRESHOLD || '').trim();
  if (rawThreshold.length === 0) {
    return DEFAULT_PIXELMATCH_THRESHOLD;
  }

  const threshold = Number(rawThreshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('UI_DRIFT_PIXELMATCH_THRESHOLD must be a number between 0 and 1');
  }

  return threshold;
}

function resolveThresholds(environment = process.env) {
  const warnThresholdPct = normalizePercentageThreshold(environment.UI_DRIFT_WARN_THRESHOLD_PCT, {
    fallbackValue: DEFAULT_WARN_THRESHOLD_PCT,
    thresholdName: 'UI_DRIFT_WARN_THRESHOLD_PCT',
  });
  const failThresholdPct = normalizePercentageThreshold(environment.UI_DRIFT_FAIL_THRESHOLD_PCT, {
    fallbackValue: DEFAULT_FAIL_THRESHOLD_PCT,
    thresholdName: 'UI_DRIFT_FAIL_THRESHOLD_PCT',
  });

  if (warnThresholdPct > failThresholdPct) {
    throw new Error(
      'UI_DRIFT_WARN_THRESHOLD_PCT must be less than or equal to UI_DRIFT_FAIL_THRESHOLD_PCT'
    );
  }

  return {
    failThresholdPct,
    warnThresholdPct,
  };
}

function readManifest(manifestPath, artifactName) {
  if (!fs.existsSync(manifestPath)) {
    return {
      error: `Missing manifest file for ${artifactName}`,
      manifest: null,
    };
  }

  let manifest;
  try {
    manifest = parseJsonFile(manifestPath);
  } catch {
    return {
      error: `Invalid JSON manifest for ${artifactName}`,
      manifest: null,
    };
  }

  const screenshotFiles = Array.isArray(manifest.screenshotFiles)
    ? manifest.screenshotFiles
        .map((fileName) => String(fileName || '').trim())
        .filter((fileName) => fileName.length > 0)
    : [];
  if (screenshotFiles.length === 0) {
    return {
      error: `Manifest for ${artifactName} does not define screenshotFiles`,
      manifest: null,
    };
  }

  return {
    error: null,
    manifest: {
      ...manifest,
      screenshotFiles: [...new Set(screenshotFiles)].sort((leftName, rightName) =>
        leftName.localeCompare(rightName)
      ),
    },
  };
}

function comparePngFiles({ baselinePath, currentPath, diffPath, pixelmatch, pixelmatchThreshold }) {
  const baselineImage = PNG.sync.read(fs.readFileSync(baselinePath));
  const currentImage = PNG.sync.read(fs.readFileSync(currentPath));

  if (baselineImage.width !== currentImage.width || baselineImage.height !== currentImage.height) {
    const diffWidth = Math.max(baselineImage.width, currentImage.width);
    const diffHeight = Math.max(baselineImage.height, currentImage.height);
    const diffImage = new PNG({ height: diffHeight, width: diffWidth });
    for (let offset = 0; offset < diffImage.data.length; offset += 4) {
      diffImage.data[offset] = 255;
      diffImage.data[offset + 1] = 0;
      diffImage.data[offset + 2] = 255;
      diffImage.data[offset + 3] = 255;
    }

    ensureDirectoryForFile(diffPath);
    fs.writeFileSync(diffPath, PNG.sync.write(diffImage));

    return {
      baselineDimensions: {
        height: baselineImage.height,
        width: baselineImage.width,
      },
      currentDimensions: {
        height: currentImage.height,
        width: currentImage.width,
      },
      diffPixels: diffWidth * diffHeight,
      dimensionMismatch: true,
      totalPixels: diffWidth * diffHeight,
    };
  }

  const diffImage = new PNG({ height: baselineImage.height, width: baselineImage.width });
  const diffPixels = pixelmatch(
    baselineImage.data,
    currentImage.data,
    diffImage.data,
    baselineImage.width,
    baselineImage.height,
    {
      threshold: pixelmatchThreshold,
    }
  );

  ensureDirectoryForFile(diffPath);
  fs.writeFileSync(diffPath, PNG.sync.write(diffImage));

  return {
    baselineDimensions: {
      height: baselineImage.height,
      width: baselineImage.width,
    },
    currentDimensions: {
      height: currentImage.height,
      width: currentImage.width,
    },
    diffPixels,
    dimensionMismatch: false,
    totalPixels: baselineImage.width * baselineImage.height,
  };
}

async function compareUiBaselineArtifacts({
  baselineArtifactsRoot,
  baselineSelection,
  currentArtifactsRoot,
  diffOutputDirectory,
  failThresholdPct,
  pixelmatchThreshold,
  warnThresholdPct,
}) {
  if (baselineSelection.status !== 'selected' || !baselineSelection.selectedRun?.id) {
    return summarizeDriftComparisons({
      baselineHeadSha: baselineSelection.selectedRun?.headSha || null,
      baselineRunId: baselineSelection.selectedRun?.id || null,
      failThresholdPct,
      skipReason: baselineSelection.skipReason || 'baseline_not_selected',
      statusOverride: 'skipped',
      warnThresholdPct,
    });
  }

  const normalizedBaselineRunId = normalizeBaselineRunId(baselineSelection.selectedRun.id);
  if (!normalizedBaselineRunId) {
    throw new Error(
      `Invalid selected baseline run id: ${String(baselineSelection.selectedRun.id || '')}`
    );
  }

  const baselineRunDirectory = path.join(baselineArtifactsRoot, normalizedBaselineRunId);
  const pixelmatch = await loadPixelmatch();
  const comparisons = [];
  const missingArtifacts = [];
  const missingBaselineFiles = [];
  const missingCurrentFiles = [];
  const newCurrentFiles = [];

  for (const artifactOs of SUPPORTED_ARTIFACT_OSES) {
    const screenshotArtifactName = `ui-screenshot-${artifactOs}`;
    const manifestArtifactName = `ui-screenshot-manifest-${artifactOs}`;
    const baselineScreenshotDirectory = path.join(baselineRunDirectory, screenshotArtifactName);
    const baselineManifestPath = path.join(
      baselineRunDirectory,
      manifestArtifactName,
      'baseline-manifest.json'
    );
    const currentScreenshotDirectory = path.join(currentArtifactsRoot, screenshotArtifactName);
    const currentManifestPath = path.join(
      currentArtifactsRoot,
      manifestArtifactName,
      'baseline-manifest.json'
    );

    if (!fs.existsSync(baselineScreenshotDirectory)) {
      missingArtifacts.push({
        artifactName: screenshotArtifactName,
        os: artifactOs,
        path: baselineScreenshotDirectory,
        source: 'baseline',
      });
    }
    if (!fs.existsSync(currentScreenshotDirectory)) {
      missingArtifacts.push({
        artifactName: screenshotArtifactName,
        os: artifactOs,
        path: currentScreenshotDirectory,
        source: 'current',
      });
    }

    const baselineManifest = readManifest(baselineManifestPath, manifestArtifactName);
    if (baselineManifest.error) {
      missingArtifacts.push({
        artifactName: manifestArtifactName,
        os: artifactOs,
        path: baselineManifestPath,
        reason: baselineManifest.error,
        source: 'baseline',
      });
    }

    const currentManifest = readManifest(currentManifestPath, manifestArtifactName);
    if (currentManifest.error) {
      missingArtifacts.push({
        artifactName: manifestArtifactName,
        os: artifactOs,
        path: currentManifestPath,
        reason: currentManifest.error,
        source: 'current',
      });
    }

    if (
      !fs.existsSync(baselineScreenshotDirectory) ||
      !fs.existsSync(currentScreenshotDirectory) ||
      baselineManifest.error ||
      currentManifest.error
    ) {
      continue;
    }

    const baselineFiles = baselineManifest.manifest.screenshotFiles;
    const currentFiles = currentManifest.manifest.screenshotFiles;
    const currentFileSet = new Set(currentFiles);
    const baselineFileSet = new Set(baselineFiles);

    const missingCurrentForOs = baselineFiles
      .filter((fileName) => !currentFileSet.has(fileName))
      .map((fileName) => ({
        fileName,
        os: artifactOs,
      }));
    missingCurrentFiles.push(...missingCurrentForOs);

    const newCurrentForOs = currentFiles
      .filter((fileName) => !baselineFileSet.has(fileName))
      .map((fileName) => ({
        fileName,
        os: artifactOs,
      }));
    newCurrentFiles.push(...newCurrentForOs);

    const missingBaselineForOs = baselineFiles
      .filter((fileName) => {
        const baselinePath = resolvePathInsideDirectory(
          fileName,
          baselineScreenshotDirectory,
          'baseline screenshot path'
        );
        return !fs.existsSync(baselinePath);
      })
      .map((fileName) => ({
        fileName,
        os: artifactOs,
      }));
    missingBaselineFiles.push(...missingBaselineForOs);
    const missingBaselineFileNames = new Set(
      missingBaselineForOs.map((missingFile) => missingFile.fileName)
    );

    const comparableFiles = baselineFiles.filter(
      (fileName) => currentFileSet.has(fileName) && !missingBaselineFileNames.has(fileName)
    );

    for (const fileName of comparableFiles) {
      const baselinePath = resolvePathInsideDirectory(
        fileName,
        baselineScreenshotDirectory,
        'baseline screenshot path'
      );
      const currentPath = resolvePathInsideDirectory(
        fileName,
        currentScreenshotDirectory,
        'current screenshot path'
      );

      if (!fs.existsSync(currentPath)) {
        missingCurrentFiles.push({
          fileName,
          os: artifactOs,
        });
        continue;
      }

      if (!fs.existsSync(baselinePath)) {
        missingBaselineFiles.push({
          fileName,
          os: artifactOs,
        });
        continue;
      }

      const diffPath = path.join(diffOutputDirectory, artifactOs, fileName);
      const imageComparison = comparePngFiles({
        baselinePath,
        currentPath,
        diffPath,
        pixelmatch,
        pixelmatchThreshold,
      });
      const driftPercent =
        imageComparison.totalPixels === 0
          ? 0
          : (imageComparison.diffPixels / imageComparison.totalPixels) * 100;

      comparisons.push({
        baselinePath: path.relative(ROOT_DIR, baselinePath),
        baselineSize: imageComparison.baselineDimensions,
        currentPath: path.relative(ROOT_DIR, currentPath),
        currentSize: imageComparison.currentDimensions,
        diffArtifactPath: path.relative(ROOT_DIR, diffPath),
        diffPixels: imageComparison.diffPixels,
        dimensionMismatch: imageComparison.dimensionMismatch,
        driftPercent,
        fileName,
        os: artifactOs,
        totalPixels: imageComparison.totalPixels,
      });
    }
  }

  comparisons.sort(sortByOsAndFile);
  missingArtifacts.sort((leftRecord, rightRecord) => {
    if (leftRecord.os === rightRecord.os) {
      return leftRecord.artifactName.localeCompare(rightRecord.artifactName);
    }

    return leftRecord.os.localeCompare(rightRecord.os);
  });
  missingBaselineFiles.sort(sortByOsAndFile);
  missingCurrentFiles.sort(sortByOsAndFile);
  newCurrentFiles.sort(sortByOsAndFile);

  return summarizeDriftComparisons({
    baselineHeadSha: baselineSelection.selectedRun.headSha || null,
    baselineRunId: baselineSelection.selectedRun.id,
    comparisons,
    failThresholdPct,
    missingArtifacts,
    missingBaselineFiles,
    missingCurrentFiles,
    newCurrentFiles,
    skipReason: null,
    warnThresholdPct,
  });
}

function writeJsonReport(reportPath, report) {
  ensureDirectoryForFile(reportPath);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function setGitHubOutput(name, value) {
  const outputFilePath = process.env.GITHUB_OUTPUT;
  if (!outputFilePath) {
    return;
  }

  const normalizedName = String(name || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedName)) {
    throw new Error(`Invalid GitHub output name: ${normalizedName || '<empty>'}`);
  }

  const normalizedValue = value == null ? '' : String(value);
  let delimiter = '__GITHUB_OUTPUT_EOF__';
  while (normalizedValue.includes(delimiter)) {
    delimiter = `_${delimiter}_`;
  }

  fs.appendFileSync(
    outputFilePath,
    `${normalizedName}<<${delimiter}\n${normalizedValue}\n${delimiter}\n`,
    'utf8'
  );
}

function emitOutputs(report, reportPath) {
  setGitHubOutput('status', report.summary.status);
  setGitHubOutput('report_path', path.relative(ROOT_DIR, reportPath));
  setGitHubOutput('compared_images', report.summary.comparedImages);
  setGitHubOutput('warning_comparisons', report.summary.warningComparisons);
  setGitHubOutput('failing_comparisons', report.summary.failingComparisons);
  setGitHubOutput('aggregate_drift_pct', report.pixelTotals.aggregateDriftPct);
  setGitHubOutput('baseline_run_id', report.baseline.runId || '');
  setGitHubOutput('baseline_head_sha', report.baseline.headSha || '');
}

async function main() {
  const baselineSelectionPath = resolvePathInsideRoot(
    process.env.UI_BASELINE_SELECTION_PATH,
    DEFAULT_BASELINE_SELECTION_PATH,
    'UI_BASELINE_SELECTION_PATH'
  );
  const baselineArtifactsRoot = resolvePathInsideRoot(
    process.env.UI_BASELINE_ARTIFACTS_ROOT,
    DEFAULT_BASELINE_ARTIFACTS_ROOT,
    'UI_BASELINE_ARTIFACTS_ROOT'
  );
  const currentArtifactsRoot = resolvePathInsideRoot(
    process.env.UI_CURRENT_ARTIFACTS_ROOT,
    DEFAULT_CURRENT_ARTIFACTS_ROOT,
    'UI_CURRENT_ARTIFACTS_ROOT'
  );
  const diffOutputDirectory = resolvePathInsideRoot(
    process.env.UI_DRIFT_DIFF_OUTPUT_DIR,
    DEFAULT_DIFF_OUTPUT_DIR,
    'UI_DRIFT_DIFF_OUTPUT_DIR'
  );
  const reportPath = resolvePathInsideRoot(
    process.env.UI_DRIFT_REPORT_PATH,
    DEFAULT_REPORT_PATH,
    'UI_DRIFT_REPORT_PATH'
  );

  const { failThresholdPct, warnThresholdPct } = resolveThresholds();
  const pixelmatchThreshold = parsePixelmatchThreshold();
  const baselineSelection = readSelectionSummary(baselineSelectionPath);

  const report = await compareUiBaselineArtifacts({
    baselineArtifactsRoot,
    baselineSelection,
    currentArtifactsRoot,
    diffOutputDirectory,
    failThresholdPct,
    pixelmatchThreshold,
    warnThresholdPct,
  });

  const fullReport = {
    ...report,
    paths: {
      baselineArtifactsRoot: path.relative(ROOT_DIR, baselineArtifactsRoot),
      baselineSelectionPath: path.relative(ROOT_DIR, baselineSelectionPath),
      currentArtifactsRoot: path.relative(ROOT_DIR, currentArtifactsRoot),
      diffOutputDirectory: path.relative(ROOT_DIR, diffOutputDirectory),
      reportPath: path.relative(ROOT_DIR, reportPath),
    },
    pixelmatchThreshold,
  };

  writeJsonReport(reportPath, fullReport);
  emitOutputs(fullReport, reportPath);

  console.log(
    `UI drift comparison completed with status="${fullReport.summary.status}". Report: ${reportPath}`
  );

  if (fullReport.summary.status === 'fail') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to compare UI baseline:', error);
    process.exit(1);
  });
}

module.exports = {
  comparePngFiles,
  compareUiBaselineArtifacts,
  isPathWithinRoot,
  normalizeBaselineRunId,
  parsePixelmatchThreshold,
  readSelectionSummary,
  resolvePathInsideRoot,
  resolveThresholds,
  setGitHubOutput,
};
