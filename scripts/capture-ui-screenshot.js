#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.join(__dirname, '..');
const RENDERER_DIR = path.join(ROOT_DIR, 'src', 'renderer');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'dist', 'qa', 'screenshots');
const SCREENSHOT_NAME =
  process.env.UI_SCREENSHOT_NAME || `ui-${process.platform}-${process.arch}.png`;
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, SCREENSHOT_NAME);
const SCREENSHOT_BASE_NAME = path.parse(SCREENSHOT_NAME).name;
const PORT = Number(process.env.UI_SCREENSHOT_PORT || 4173);

const MIME_TYPES = {
  '.css': 'text/css; charset=UTF-8',
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

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
        path: `${MOCK_ROOT_PATH}/src/App.tsx`,
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

const SCREENSHOTS = {
  configDefault: SCREENSHOT_PATH,
  sourceTab: path.join(SCREENSHOT_DIR, `${SCREENSHOT_BASE_NAME}-source.png`),
  sourceSelected: path.join(SCREENSHOT_DIR, `${SCREENSHOT_BASE_NAME}-source-selected.png`),
  sourceSelectedResized: path.join(
    SCREENSHOT_DIR,
    `${SCREENSHOT_BASE_NAME}-source-selected-resized.png`
  ),
};

async function setupMockElectronApi(page) {
  await page.addInitScript(
    ({ mockRootPath, mockConfig, mockDirectoryTree }) => {
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
            stats[filePath] = { mtime: Date.now(), size: 1024 };
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
    }
  );
}

async function captureAppStateScreenshots(page) {
  await page.waitForSelector('#app', { timeout: 10000 });
  await page.waitForSelector('[data-tab="config"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: SCREENSHOTS.configDefault, fullPage: true });

  await page.click('[data-tab="source"]');
  await page.waitForSelector('#select-all-checkbox', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SCREENSHOTS.sourceTab, fullPage: true });

  await page.locator('button[aria-label="Expand folder src"]').first().click();
  await page.getByText('App.tsx').first().click();
  await page.getByText('1 of 3 files selected').waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SCREENSHOTS.sourceSelected, fullPage: true });

  await page.setViewportSize({ width: 960, height: 700 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SCREENSHOTS.sourceSelectedResized, fullPage: true });
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
    await setupMockElectronApi(page);
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
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
