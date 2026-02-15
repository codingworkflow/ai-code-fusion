#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_SCREENSHOT_DIR = path.join(ROOT_DIR, 'dist', 'qa', 'screenshots');
const DEFAULT_MANIFEST_PATH = path.join(ROOT_DIR, 'dist', 'qa', 'baseline-manifest.json');
const SUPPORTED_ARTIFACT_OSES = new Set(['linux', 'windows', 'macos']);

function isPathWithinRoot(targetPath) {
  const relativePath = path.relative(ROOT_DIR, targetPath);
  if (relativePath === '') {
    return true;
  }

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function resolvePathInsideRoot(rawValue, fallbackPath, environmentVariableName) {
  const resolvedPath = path.resolve(rawValue || fallbackPath);
  if (!isPathWithinRoot(resolvedPath)) {
    throw new Error(
      `${environmentVariableName} must resolve inside the repository root (${ROOT_DIR}): ${resolvedPath}`
    );
  }

  return resolvedPath;
}

function normalizeArtifactOs(rawValue) {
  const normalizedValue = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (!SUPPORTED_ARTIFACT_OSES.has(normalizedValue)) {
    throw new Error(
      `Unsupported QA_ARTIFACT_OS value "${rawValue}". Expected one of: ${Array.from(
        SUPPORTED_ARTIFACT_OSES
      ).join(', ')}`
    );
  }

  return normalizedValue;
}

function listScreenshotFiles(screenshotDirectory) {
  if (!fs.existsSync(screenshotDirectory)) {
    throw new Error(`Screenshot directory not found: ${screenshotDirectory}`);
  }

  const screenshotFiles = fs
    .readdirSync(screenshotDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => fileName.toLowerCase().endsWith('.png'))
    .sort((leftName, rightName) => leftName.localeCompare(rightName));

  if (screenshotFiles.length === 0) {
    throw new Error(`No PNG screenshots found in ${screenshotDirectory}`);
  }

  return screenshotFiles;
}

function buildBaselineManifest({
  artifactOs,
  screenshotFiles,
  environment = process.env,
  now = new Date(),
}) {
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    workflow: {
      name: environment.GITHUB_WORKFLOW || null,
      event: environment.GITHUB_EVENT_NAME || null,
    },
    run: {
      id: environment.GITHUB_RUN_ID || null,
      attempt: environment.GITHUB_RUN_ATTEMPT || null,
    },
    git: {
      sha: environment.GITHUB_SHA || null,
      ref: environment.GITHUB_REF_NAME || null,
    },
    os: artifactOs,
    screenshotArtifact: `ui-screenshot-${artifactOs}`,
    screenshotFiles,
  };
}

function writeManifest({
  screenshotDirectory,
  manifestPath,
  artifactOs,
  environment = process.env,
  now = new Date(),
}) {
  const screenshotFiles = listScreenshotFiles(screenshotDirectory);
  const manifest = buildBaselineManifest({ artifactOs, screenshotFiles, environment, now });

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function main() {
  const screenshotDirectory = resolvePathInsideRoot(
    process.env.UI_SCREENSHOT_DIR,
    DEFAULT_SCREENSHOT_DIR,
    'UI_SCREENSHOT_DIR'
  );
  const manifestPath = resolvePathInsideRoot(
    process.env.UI_BASELINE_MANIFEST_PATH,
    DEFAULT_MANIFEST_PATH,
    'UI_BASELINE_MANIFEST_PATH'
  );
  const artifactOs = normalizeArtifactOs(process.env.QA_ARTIFACT_OS);

  const manifest = writeManifest({
    screenshotDirectory,
    manifestPath,
    artifactOs,
  });

  console.log(
    `UI baseline manifest written: ${manifestPath} (${manifest.os}, ${manifest.screenshotFiles.length} screenshots)`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Failed to generate UI baseline manifest:', error);
    process.exit(1);
  }
}

module.exports = {
  buildBaselineManifest,
  isPathWithinRoot,
  listScreenshotFiles,
  normalizeArtifactOs,
  resolvePathInsideRoot,
  writeManifest,
};
