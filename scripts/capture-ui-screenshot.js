#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.join(__dirname, '..');
const RENDERER_DIR = path.join(ROOT_DIR, 'src', 'renderer');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'dist', 'qa', 'screenshots');
const PORT = Number(process.env.UI_SCREENSHOT_PORT || 4173);
const DEFAULT_SCREENSHOT_NAME = `ui-${process.platform}-${process.arch}.png`;
const FIXED_MTIME = 1700000000000;

const MIME_TYPES = {
  '.css': 'text/css; charset=UTF-8',
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function ensureError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function sanitizeScreenshotName(nameCandidate) {
  const rawName =
    typeof nameCandidate === 'string' && nameCandidate.trim()
      ? nameCandidate.trim()
      : DEFAULT_SCREENSHOT_NAME;
  const baseName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^\.+/, '');
  const withExtension = baseName.toLowerCase().endsWith('.png') ? baseName : `${baseName}.png`;

  if (!withExtension || withExtension === '.png') {
    return DEFAULT_SCREENSHOT_NAME;
  }

  return withExtension;
}

function resolveOutputPath(fileName) {
  const targetPath = path.resolve(SCREENSHOT_DIR, fileName);
  const relativeToRoot = path.relative(SCREENSHOT_DIR, targetPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Invalid screenshot path: ${fileName}`);
  }

  return targetPath;
}

async function runStep(stepName, action) {
  try {
    return await action();
  } catch (error) {
    const err = ensureError(error);
    throw new Error(`${stepName}: ${err.message}`);
  }
}

function resolveFilePath(requestUrl) {
  const urlPath = decodeURIComponent(requestUrl.split('?')[0]);
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const absolutePath = path.resolve(RENDERER_DIR, relativePath);
  const relativeToRoot = path.relative(RENDERER_DIR, absolutePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return absolutePath;
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const requestedPath = resolveFilePath(request.url || '/');

    if (!requestedPath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
      response.end('Forbidden');
      return;
    }

    fs.readFile(requestedPath, (error, content) => {
      if (error) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        response.end('Not Found');
        return;
      }

      const extension = path.extname(requestedPath).toLowerCase();
      const contentType = MIME_TYPES[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(content);
    });
  });
}

const MOCK_ROOT_PATH = '/mock-repository';
const MOCK_APP_FILE_PATH = `${MOCK_ROOT_PATH}/src/App.tsx`;
const MOCK_FEATURE_MODULE_COUNT = 24;
const MOCK_CONFIG = [
  'include_extensions:',
  '  - .ts',
  '  - .tsx',
  '  - .js',
  'exclude_patterns:',
  '  - node_modules/**',
  'use_gitignore: true',
].join('\n');

function toMockPath(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '');
  return `${MOCK_ROOT_PATH}/${normalized}`;
}

function getMockName(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : normalized;
}

function createMockFile(relativePath) {
  return {
    type: 'file',
    name: getMockName(relativePath),
    path: toMockPath(relativePath),
  };
}

function createMockDirectory(relativePath, children) {
  return {
    type: 'directory',
    name: getMockName(relativePath),
    path: toMockPath(relativePath),
    children,
  };
}

function createFeatureModule(moduleIndex) {
  const moduleId = String(moduleIndex).padStart(2, '0');
  const moduleName = `feature-${moduleId}`;
  const featureComponent = `Feature${moduleId}`;
  const basePath = `src/features/${moduleName}`;

  return createMockDirectory(basePath, [
    createMockFile(`${basePath}/index.ts`),
    createMockFile(`${basePath}/model.ts`),
    createMockDirectory(`${basePath}/hooks`, [
      createMockFile(`${basePath}/hooks/use${featureComponent}.ts`),
      createMockFile(`${basePath}/hooks/use${featureComponent}Filters.ts`),
    ]),
    createMockDirectory(`${basePath}/ui`, [
      createMockFile(`${basePath}/ui/${featureComponent}Panel.tsx`),
      createMockFile(`${basePath}/ui/${featureComponent}Toolbar.tsx`),
      createMockFile(`${basePath}/ui/${featureComponent}Table.tsx`),
    ]),
  ]);
}

function createPackageModule(moduleIndex) {
  const moduleId = String(moduleIndex).padStart(2, '0');
  const moduleName = `shared-${moduleId}`;
  const basePath = `packages/${moduleName}`;

  return createMockDirectory(basePath, [
    createMockFile(`${basePath}/package.json`),
    createMockDirectory(`${basePath}/src`, [
      createMockFile(`${basePath}/src/index.ts`),
      createMockFile(`${basePath}/src/${moduleName}.ts`),
      createMockFile(`${basePath}/src/${moduleName}.test.ts`),
    ]),
  ]);
}

function createTestSuite(moduleIndex) {
  const moduleId = String(moduleIndex).padStart(2, '0');
  return createMockFile(`tests/integration/feature-${moduleId}.spec.ts`);
}

function countMockFiles(items) {
  let count = 0;
  for (const item of items) {
    if (item.type === 'file') {
      count += 1;
      continue;
    }
    if (item.children) {
      count += countMockFiles(item.children);
    }
  }
  return count;
}

const mockFeatures = Array.from({ length: MOCK_FEATURE_MODULE_COUNT }, (_, index) =>
  createFeatureModule(index + 1)
);

const mockPackages = Array.from({ length: 10 }, (_, index) => createPackageModule(index + 1));
const mockIntegrationTests = Array.from({ length: 16 }, (_, index) => createTestSuite(index + 1));

const MOCK_DEEP_FEATURE_NAME = `feature-${String(MOCK_FEATURE_MODULE_COUNT).padStart(2, '0')}`;
const MOCK_DEEP_FEATURE_FILE_PATH = toMockPath(
  `src/features/${MOCK_DEEP_FEATURE_NAME}/ui/Feature${String(MOCK_FEATURE_MODULE_COUNT).padStart(
    2,
    '0'
  )}Panel.tsx`
);

const MOCK_DIRECTORY_TREE = [
  createMockDirectory('src', [
    createMockFile('src/App.tsx'),
    createMockFile('src/index.tsx'),
    createMockFile('src/bootstrap.ts'),
    createMockDirectory('src/components', [
      createMockFile('src/components/NavBar.tsx'),
      createMockFile('src/components/Footer.tsx'),
      createMockDirectory('src/components/common', [
        createMockFile('src/components/common/Button.tsx'),
        createMockFile('src/components/common/Card.tsx'),
        createMockFile('src/components/common/Modal.tsx'),
      ]),
    ]),
    createMockDirectory('src/hooks', [
      createMockFile('src/hooks/useDebouncedValue.ts'),
      createMockFile('src/hooks/useRepositoryScan.ts'),
      createMockFile('src/hooks/useTheme.ts'),
    ]),
    createMockDirectory('src/utils', [
      createMockFile('src/utils/path-utils.ts'),
      createMockFile('src/utils/filter-utils.ts'),
      createMockFile('src/utils/token-utils.ts'),
    ]),
    createMockDirectory('src/features', mockFeatures),
  ]),
  createMockDirectory('packages', mockPackages),
  createMockDirectory('tests', [
    createMockDirectory('tests/unit', [
      createMockFile('tests/unit/app.test.tsx'),
      createMockFile('tests/unit/file-tree.test.tsx'),
      createMockFile('tests/unit/filtering.test.ts'),
    ]),
    createMockDirectory('tests/integration', mockIntegrationTests),
    createMockDirectory('tests/e2e', [
      createMockFile('tests/e2e/file-selection.spec.ts'),
      createMockFile('tests/e2e/resize-regression.spec.ts'),
      createMockFile('tests/e2e/filters-regression.spec.ts'),
    ]),
  ]),
  createMockDirectory('docs', [
    createMockFile('docs/README.md'),
    createMockFile('docs/CONFIGURATION.md'),
    createMockFile('docs/ARCHITECTURE.md'),
    createMockFile('docs/SECURITY.md'),
    createMockFile('docs/TROUBLESHOOTING.md'),
  ]),
];

const MOCK_TOTAL_FILE_COUNT = countMockFiles(MOCK_DIRECTORY_TREE);

const SCREENSHOT_NAME = sanitizeScreenshotName(process.env.UI_SCREENSHOT_NAME);
const SCREENSHOT_BASE_NAME = path.parse(SCREENSHOT_NAME).name;
const SCREENSHOT_PATH = resolveOutputPath(SCREENSHOT_NAME);

const SCREENSHOTS = {
  configDefault: SCREENSHOT_PATH,
  sourceTab: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-source.png`),
  sourceSelected: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-source-selected.png`),
  sourceSelectedResized: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-source-selected-resized.png`),
};

const UI_SELECTORS = {
  appRoot: '#app',
  configTab: '[data-tab="config"]',
  sourceTab: '[data-tab="source"]',
  sourceFolderExpandButton: 'button[aria-label="Expand folder src"]',
  sourceFeaturesFolderExpandButton: 'button[aria-label="Expand folder features"]',
  sourceDeepFeatureFolderExpandButton: `button[aria-label="Expand folder ${MOCK_DEEP_FEATURE_NAME}"]`,
  sourceDeepUiFolderExpandButton: 'button[aria-label="Expand folder ui"]',
  appFileEntry: `[title="${MOCK_APP_FILE_PATH}"]`,
  deepFeatureFileEntry: `[title="${MOCK_DEEP_FEATURE_FILE_PATH}"]`,
  fileTreeScrollContainer: '.file-tree .overflow-auto',
};

async function setupMockElectronApi(page) {
  await page.addInitScript(
    ({ mockRootPath, mockConfig, mockDirectoryTree, fixedMtime }) => {
      localStorage.setItem('rootPath', mockRootPath);
      localStorage.setItem('configContent', mockConfig);

      window.electronAPI = {
        getDefaultConfig: async () => mockConfig,
        selectDirectory: async () => mockRootPath,
        getDirectoryTree: async () => mockDirectoryTree,
        analyzeRepository: async () => ({
          totalFiles: 0,
          totalTokens: 0,
          files: [],
        }),
        processRepository: async () => ({
          content: '',
          stats: {
            totalFiles: 0,
            totalTokens: 0,
            skippedFiles: 0,
            processedFiles: 0,
          },
        }),
        countFilesTokens: async (files) => {
          const results = {};
          const stats = {};

          for (const filePath of files) {
            results[filePath] = 120;
            stats[filePath] = { mtime: fixedMtime, size: 1024 };
          }

          return { results, stats };
        },
        resetGitignoreCache: async () => {},
        saveFile: async () => true,
      };

      window.electron = {
        shell: {
          openExternal: () => {},
        },
      };
    },
    {
      mockRootPath: MOCK_ROOT_PATH,
      mockConfig: MOCK_CONFIG,
      mockDirectoryTree: MOCK_DIRECTORY_TREE,
      fixedMtime: FIXED_MTIME,
    }
  );
}

async function captureAppStateScreenshots(page) {
  await runStep('Disable animations for stable screenshots', async () => {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition-duration: 0s !important;
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          scroll-behavior: auto !important;
        }
      `,
    });
  });

  await runStep('Wait for app root', async () => {
    await page.waitForSelector(UI_SELECTORS.appRoot, { timeout: 10000 });
  });

  await runStep('Wait for config tab', async () => {
    await page.waitForSelector(UI_SELECTORS.configTab, { timeout: 10000 });
  });

  await runStep('Capture config tab screenshot', async () => {
    await page.screenshot({ path: SCREENSHOTS.configDefault, fullPage: true });
  });

  await runStep('Switch to source tab', async () => {
    await page.click(UI_SELECTORS.sourceTab);
  });

  await runStep('Wait for source folder control', async () => {
    await page.locator(UI_SELECTORS.sourceFolderExpandButton).first().waitFor({ timeout: 10000 });
  });

  await runStep('Wait for large mock file count to load', async () => {
    await page.waitForFunction((totalFiles) => {
      const fileTreeRoot = document.querySelector('.file-tree');
      if (!fileTreeRoot) {
        return false;
      }
      const summaryText = fileTreeRoot.textContent || '';
      return summaryText.includes(`of ${totalFiles} files selected`);
    }, MOCK_TOTAL_FILE_COUNT);
  });

  await runStep('Capture source tab screenshot', async () => {
    await page.screenshot({ path: SCREENSHOTS.sourceTab, fullPage: true });
  });

  await runStep('Expand source folder', async () => {
    await page.locator(UI_SELECTORS.sourceFolderExpandButton).first().click();
  });

  await runStep('Wait for app file entry', async () => {
    await page.locator(UI_SELECTORS.appFileEntry).first().waitFor({ timeout: 10000 });
  });

  await runStep('Select app file', async () => {
    await page.locator(UI_SELECTORS.appFileEntry).first().click();
  });

  await runStep('Wait for single selected file', async () => {
    await page.waitForFunction(() => {
      return document.querySelectorAll('.file-tree input[type="checkbox"]:checked').length === 1;
    });
  });

  await runStep('Capture selected file screenshot', async () => {
    await page.screenshot({ path: SCREENSHOTS.sourceSelected, fullPage: true });
  });

  await runStep('Resize viewport', async () => {
    await page.setViewportSize({ width: 960, height: 700 });
  });

  await runStep('Expand feature folders in resized viewport', async () => {
    await page.locator(UI_SELECTORS.sourceFeaturesFolderExpandButton).first().click();
    await page.locator(UI_SELECTORS.sourceDeepFeatureFolderExpandButton).first().click();
    await page.locator(UI_SELECTORS.sourceDeepUiFolderExpandButton).first().click();
  });

  await runStep('Verify file tree container remains usable after resize', async () => {
    await page.waitForFunction((selector) => {
      const container = document.querySelector(selector);
      if (!(container instanceof HTMLElement)) {
        return false;
      }
      return container.clientHeight >= 160;
    }, UI_SELECTORS.fileTreeScrollContainer);
  });

  await runStep('Select deep feature file after resize', async () => {
    const deepFile = page.locator(UI_SELECTORS.deepFeatureFileEntry).first();
    await deepFile.scrollIntoViewIfNeeded();
    await deepFile.click();
  });

  await runStep('Wait for two selected files after resize', async () => {
    await page.waitForFunction(() => {
      return document.querySelectorAll('.file-tree input[type="checkbox"]:checked').length === 2;
    });
  });

  await runStep('Capture resized screenshot with deep tree expanded', async () => {
    await page.screenshot({ path: SCREENSHOTS.sourceSelectedResized, fullPage: true });
  });
}

async function captureScreenshot() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await runStep('Setup mock Electron API', async () => {
      await setupMockElectronApi(page);
    });
    await runStep('Open renderer page', async () => {
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
    });
    await captureAppStateScreenshots(page);
    Object.values(SCREENSHOTS).forEach((screenshotPath) => {
      console.log(`UI screenshot captured: ${screenshotPath}`);
    });
  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

captureScreenshot().catch((error) => {
  console.error(`Failed to capture UI screenshot: ${error.message}`);
  process.exit(1);
});
