jest.unmock('fs');

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildBaselineManifest,
  isPathWithinRoot,
  listScreenshotFiles,
  normalizeArtifactOs,
  resolvePathInsideRoot,
  writeManifest,
} = require('../../../scripts/generate-ui-baseline-manifest');

function createTemporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('generate-ui-baseline-manifest', () => {
  test('normalizeArtifactOs accepts expected values', () => {
    expect(normalizeArtifactOs('linux')).toBe('linux');
    expect(normalizeArtifactOs('Windows')).toBe('windows');
    expect(normalizeArtifactOs(' macOS ')).toBe('macos');
    expect(() => normalizeArtifactOs('freebsd')).toThrow(/Unsupported QA_ARTIFACT_OS value/);
  });

  test('listScreenshotFiles returns sorted png files only', () => {
    const tempDirectory = createTemporaryDirectory('ui-manifest-screenshots-');
    try {
      fs.writeFileSync(path.join(tempDirectory, 'ui-linux-source.png'), 'a');
      fs.writeFileSync(path.join(tempDirectory, 'readme.txt'), 'b');
      fs.writeFileSync(path.join(tempDirectory, 'ui-linux.png'), 'c');
      fs.mkdirSync(path.join(tempDirectory, 'nested'));
      fs.writeFileSync(path.join(tempDirectory, 'nested', 'ui-linux-processed.png'), 'd');

      expect(listScreenshotFiles(tempDirectory)).toEqual(['ui-linux-source.png', 'ui-linux.png']);
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  test('listScreenshotFiles throws when screenshot directory is missing or has no png files', () => {
    const missingDirectory = path.join(os.tmpdir(), 'ui-manifest-missing-dir', `${Date.now()}`);
    expect(() => listScreenshotFiles(missingDirectory)).toThrow(/Screenshot directory not found/);

    const tempDirectory = createTemporaryDirectory('ui-manifest-no-png-');
    try {
      fs.writeFileSync(path.join(tempDirectory, 'readme.txt'), 'a');
      expect(() => listScreenshotFiles(tempDirectory)).toThrow(/No PNG screenshots found/);
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  test('resolvePathInsideRoot rejects paths outside repository root', () => {
    const insidePath = path.join(process.cwd(), 'dist', 'qa', 'screenshots');
    const outsidePath = path.resolve(process.cwd(), '..', '..', 'outside-repo-path');
    expect(isPathWithinRoot(insidePath)).toBe(true);
    expect(() => resolvePathInsideRoot(outsidePath, insidePath, 'UI_SCREENSHOT_DIR')).toThrow(
      /must resolve inside the repository root/
    );
  });

  test('buildBaselineManifest and writeManifest include run metadata and screenshot map', () => {
    const screenshotDirectory = createTemporaryDirectory('ui-manifest-write-screenshots-');
    const outputDirectory = createTemporaryDirectory('ui-manifest-write-output-');
    const manifestPath = path.join(outputDirectory, 'baseline-manifest.json');
    const fixedDate = new Date('2026-02-15T03:00:00.000Z');
    const environment = {
      GITHUB_WORKFLOW: 'QA Matrix',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_RUN_ID: '22000000000',
      GITHUB_RUN_ATTEMPT: '3',
      GITHUB_SHA: '8a4ddd0b928baf0c53357b43831b17f83f2838f5',
      GITHUB_REF_NAME: 'main',
    };

    try {
      fs.writeFileSync(path.join(screenshotDirectory, 'ui-linux.png'), 'a');
      fs.writeFileSync(path.join(screenshotDirectory, 'ui-linux-source.png'), 'b');

      const manifest = writeManifest({
        screenshotDirectory,
        manifestPath,
        artifactOs: 'linux',
        environment,
        now: fixedDate,
      });

      expect(manifest).toEqual(
        buildBaselineManifest({
          artifactOs: 'linux',
          screenshotFiles: ['ui-linux-source.png', 'ui-linux.png'],
          environment,
          now: fixedDate,
        })
      );

      const persistedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(persistedManifest).toEqual(manifest);
      expect(persistedManifest).toMatchObject({
        os: 'linux',
        screenshotArtifact: 'ui-screenshot-linux',
        git: {
          ref: 'main',
          sha: '8a4ddd0b928baf0c53357b43831b17f83f2838f5',
        },
        run: {
          attempt: '3',
          id: '22000000000',
        },
        workflow: {
          event: 'push',
          name: 'QA Matrix',
        },
      });
    } finally {
      fs.rmSync(screenshotDirectory, { recursive: true, force: true });
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
