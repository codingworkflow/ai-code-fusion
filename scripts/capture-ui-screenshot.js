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
const MOCK_CONFIG = [
  'include_extensions:',
  '  - .ts',
  '  - .tsx',
  '  - .js',
  'exclude_patterns:',
  '  - node_modules/**',
  'use_gitignore: true',
].join('\n');

const MOCK_DIRECTORY_TREE = [
  {
    type: 'directory',
    name: 'src',
    path: `${MOCK_ROOT_PATH}/src`,
    children: [
      {
        type: 'file',
        name: 'App.tsx',
        path: MOCK_APP_FILE_PATH,
      },
      {
        type: 'file',
        name: 'index.tsx',
        path: `${MOCK_ROOT_PATH}/src/index.tsx`,
      },
    ],
  },
  {
    type: 'directory',
    name: 'tests',
    path: `${MOCK_ROOT_PATH}/tests`,
    children: [
      {
        type: 'file',
        name: 'app.test.tsx',
        path: `${MOCK_ROOT_PATH}/tests/app.test.tsx`,
      },
    ],
  },
];

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
  appFileEntry: `[title="${MOCK_APP_FILE_PATH}"]`,
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

  await runStep('Capture resized screenshot', async () => {
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
