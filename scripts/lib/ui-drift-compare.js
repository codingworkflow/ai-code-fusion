const DEFAULT_WARN_THRESHOLD_PCT = 0.1;
const DEFAULT_FAIL_THRESHOLD_PCT = 0.5;

function roundPercentage(rawValue) {
  return Number(rawValue.toFixed(6));
}

function normalizePercentageThreshold(rawValue, { fallbackValue, thresholdName }) {
  if (rawValue == null || String(rawValue).trim().length === 0) {
    return fallbackValue;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > 100) {
    throw new Error(`${thresholdName} must be a number between 0 and 100`);
  }

  return numericValue;
}

function evaluateDriftStatus({ driftPercent, warnThresholdPct, failThresholdPct }) {
  if (driftPercent > failThresholdPct) {
    return 'fail';
  }

  if (driftPercent > warnThresholdPct) {
    return 'warn';
  }

  return 'pass';
}

function sortByOsAndFile(leftRecord, rightRecord) {
  if (leftRecord.os === rightRecord.os) {
    return leftRecord.fileName.localeCompare(rightRecord.fileName);
  }

  return leftRecord.os.localeCompare(rightRecord.os);
}

function summarizeDriftComparisons({
  baselineHeadSha = null,
  baselineRunId = null,
  comparisons = [],
  failThresholdPct = DEFAULT_FAIL_THRESHOLD_PCT,
  missingArtifacts = [],
  missingBaselineFiles = [],
  missingCurrentFiles = [],
  newCurrentFiles = [],
  skipReason = null,
  statusOverride = null,
  warnThresholdPct = DEFAULT_WARN_THRESHOLD_PCT,
}) {
  const normalizedComparisons = [...comparisons]
    .map((comparison) => {
      const roundedDriftPercent = roundPercentage(comparison.driftPercent || 0);
      return {
        ...comparison,
        driftPercent: roundedDriftPercent,
        status: evaluateDriftStatus({
          driftPercent: roundedDriftPercent,
          warnThresholdPct,
          failThresholdPct,
        }),
      };
    })
    .sort(sortByOsAndFile);

  const totalPixelsCompared = normalizedComparisons.reduce(
    (totalPixels, comparison) => totalPixels + (comparison.totalPixels || 0),
    0
  );
  const totalDifferentPixels = normalizedComparisons.reduce(
    (totalPixels, comparison) => totalPixels + (comparison.diffPixels || 0),
    0
  );
  const aggregateDriftPct =
    totalPixelsCompared === 0
      ? 0
      : roundPercentage((totalDifferentPixels / totalPixelsCompared) * 100);
  const maxDriftPct = normalizedComparisons.reduce(
    (currentMax, comparison) => Math.max(currentMax, comparison.driftPercent || 0),
    0
  );
  const warningComparisons = normalizedComparisons.filter(
    (comparison) => comparison.status === 'warn'
  ).length;
  const failingComparisons = normalizedComparisons.filter(
    (comparison) => comparison.status === 'fail'
  ).length;

  const hasArtifactGaps =
    missingArtifacts.length > 0 ||
    missingBaselineFiles.length > 0 ||
    missingCurrentFiles.length > 0 ||
    newCurrentFiles.length > 0;

  let overallStatus = statusOverride;
  if (!overallStatus) {
    if (hasArtifactGaps || failingComparisons > 0) {
      overallStatus = 'fail';
    } else if (warningComparisons > 0) {
      overallStatus = 'warn';
    } else {
      overallStatus = 'pass';
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    thresholds: {
      failThresholdPct,
      warnThresholdPct,
    },
    pixelTotals: {
      aggregateDriftPct,
      comparedImages: normalizedComparisons.length,
      maxDriftPct: roundPercentage(maxDriftPct),
      totalDifferentPixels,
      totalPixelsCompared,
    },
    baseline: {
      headSha: baselineHeadSha,
      runId: baselineRunId,
    },
    summary: {
      comparedImages: normalizedComparisons.length,
      failingComparisons,
      missingArtifactsCount: missingArtifacts.length,
      missingBaselineFilesCount: missingBaselineFiles.length,
      missingCurrentFilesCount: missingCurrentFiles.length,
      newCurrentFilesCount: newCurrentFiles.length,
      skipReason,
      status: overallStatus,
      warningComparisons,
    },
    missingArtifacts,
    missingBaselineFiles,
    missingCurrentFiles,
    newCurrentFiles,
    comparisons: normalizedComparisons,
  };
}

module.exports = {
  DEFAULT_FAIL_THRESHOLD_PCT,
  DEFAULT_WARN_THRESHOLD_PCT,
  evaluateDriftStatus,
  normalizePercentageThreshold,
  sortByOsAndFile,
  summarizeDriftComparisons,
};
