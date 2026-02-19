#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'src', 'assets');
const RENDERER_SOURCE_DIR = path.join(ROOT_DIR, 'src', 'renderer');
const RENDERER_PUBLIC_DIR = path.join(RENDERER_SOURCE_DIR, 'public');
const RENDERER_BUILD_DIR = path.join(ROOT_DIR, 'dist', 'renderer');
const DEFAULT_SCREENSHOT_DIR = path.join('dist', 'qa', 'screenshots');
const SCREENSHOT_DIR = resolveOutputDirectory(process.env.UI_SCREENSHOT_DIR);
const PORT = Number(process.env.UI_SCREENSHOT_PORT || 4173);
const DEFAULT_SCREENSHOT_NAME = `ui-${process.platform}-${process.arch}.png`;
const DEFAULT_LOCALE = 'en';
const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de'];
const FIXED_MTIME = 1700000000000;
const QA_DISABLE_ANIMATIONS_STYLESHEET_PATH = '/__qa__/disable-animations.css';
const QA_DISABLE_ANIMATIONS_STYLESHEET_CONTENT = `
*, *::before, *::after {
  transition-duration: 0s !important;
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  scroll-behavior: auto !important;
}
`;

function loadSecretScannerHelpers() {
  const compiledSecretScannerPath = path.join(
    ROOT_DIR,
    'build',
    'ts',
    'utils',
    'secret-scanner.js'
  );

  try {
    return require(compiledSecretScannerPath);
  } catch (_error) {
    throw new Error(
      'Unable to load compiled secret scanner helpers. Run "npm run build:ts" before "npm run qa:screenshot".'
    );
  }
}

const { isSensitiveFilePath } = loadSecretScannerHelpers();

const MIME_TYPES = {
  '.css': 'text/css; charset=UTF-8',
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const STATIC_FILE_ROUTES = new Map([
  ['/', path.join(RENDERER_PUBLIC_DIR, 'index.html')],
  ['/index.html', path.join(RENDERER_PUBLIC_DIR, 'index.html')],
  ['/assets/icon.png', path.join(ASSETS_DIR, 'icon.png')],
  ['/dist/renderer/output.css', path.join(RENDERER_BUILD_DIR, 'output.css')],
  ['/dist/renderer/bundle.js', path.join(RENDERER_BUILD_DIR, 'bundle.js')],
  ['/dist/renderer/bundle.js.map', path.join(RENDERER_BUILD_DIR, 'bundle.js.map')],
  ['/dist/renderer/bundle.js.LICENSE.txt', path.join(RENDERER_BUILD_DIR, 'bundle.js.LICENSE.txt')],
]);

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
  const baseName = path
    .basename(rawName)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '');
  const withExtension = baseName.toLowerCase().endsWith('.png') ? baseName : `${baseName}.png`;

  if (!withExtension || withExtension === '.png') {
    return DEFAULT_SCREENSHOT_NAME;
  }

  return withExtension;
}

function resolveOutputDirectory(dirCandidate) {
  const rawDir =
    typeof dirCandidate === 'string' && dirCandidate.trim()
      ? dirCandidate.trim()
      : DEFAULT_SCREENSHOT_DIR;
  const absoluteDir = path.resolve(ROOT_DIR, rawDir);
  const relativeToRoot = path.relative(ROOT_DIR, absoluteDir);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Invalid screenshot directory: ${rawDir}`);
  }

  return absoluteDir;
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
  const rawPath = typeof requestUrl === 'string' ? requestUrl : '/';
  let urlPath;

  try {
    urlPath = decodeURIComponent(rawPath.split('?')[0]);
  } catch {
    return null;
  }

  return STATIC_FILE_ROUTES.get(urlPath) ?? null;
}

function createStaticServer() {
  return http.createServer((request, response) => {
    let requestPath;

    try {
      requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=UTF-8' });
      response.end('Bad Request');
      return;
    }

    if (requestPath === QA_DISABLE_ANIMATIONS_STYLESHEET_PATH) {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=UTF-8' });
      response.end(QA_DISABLE_ANIMATIONS_STYLESHEET_CONTENT);
      return;
    }

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
const MOCK_SECRET_FILE_PATH = `${MOCK_ROOT_PATH}/.env`;
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
  createMockFile('.env'),
  createMockFile('.npmrc'),
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

function cloneAndFilterMockTree(items, excludeSensitiveFiles) {
  const filtered = [];

  for (const item of items) {
    if (item.type === 'file') {
      if (excludeSensitiveFiles && isSensitiveFilePath(item.path)) {
        continue;
      }

      filtered.push({ ...item });
      continue;
    }

    const children = Array.isArray(item.children)
      ? cloneAndFilterMockTree(item.children, excludeSensitiveFiles)
      : [];
    filtered.push({ ...item, children });
  }

  return filtered;
}

const MOCK_FILTERED_DIRECTORY_TREE = cloneAndFilterMockTree(MOCK_DIRECTORY_TREE, true);
const MOCK_VISIBLE_FILE_COUNT_WITH_SECRET_FILTER = countMockFiles(MOCK_FILTERED_DIRECTORY_TREE);

const SCREENSHOT_NAME = sanitizeScreenshotName(process.env.UI_SCREENSHOT_NAME);
const SCREENSHOT_BASE_NAME = path.parse(SCREENSHOT_NAME).name;
const SCREENSHOT_PATH = resolveOutputPath(SCREENSHOT_NAME);
const LOCALE_SCREENSHOT_PATHS = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    resolveOutputPath(`${SCREENSHOT_BASE_NAME}-locale-${locale}.png`),
  ])
);

const SCREENSHOTS = {
  configDefault: SCREENSHOT_PATH,
  sourceTab: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-source.png`),
  sourceSelected: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-source-selected.png`),
  sourceSelectedResized: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-source-selected-resized.png`),
  processedTab: resolveOutputPath(`${SCREENSHOT_BASE_NAME}-processed.png`),
};

const UI_SELECTORS = {
  appRoot: '#app',
  languageSelector: '#language-selector',
  configTab: '[data-tab="config"]',
  sourceTab: '[data-tab="source"]',
  processedTabActive: '[data-tab="processed"][aria-selected="true"]',
  secretScanningToggle: '#enable-secret-scanning',
  suspiciousFilesToggle: '#exclude-suspicious-files',
  sourceFolderExpandButton: 'button[aria-label="Expand folder src"]',
  sourceFeaturesFolderExpandButton: 'button[aria-label="Expand folder features"]',
  sourceDeepFeatureFolderExpandButton: `button[aria-label="Expand folder ${MOCK_DEEP_FEATURE_NAME}"]`,
  sourceDeepUiFolderExpandButton: 'button[aria-label="Expand folder ui"]',
  appFileEntry: `[title="${MOCK_APP_FILE_PATH}"]`,
  deepFeatureFileEntry: `[title="${MOCK_DEEP_FEATURE_FILE_PATH}"]`,
  secretFileEntry: `[title="${MOCK_SECRET_FILE_PATH}"]`,
  refreshFileListButton: 'button[title="Refresh the file list"]',
  fileTreeScrollContainer: '.file-tree .overflow-auto',
  processSelectedFilesButton: '[data-testid="process-selected-files-button"]',
  processedContent: '#processed-content',
};

async function setupMockElectronApi(page) {
  await page.addInitScript(
    ({ mockRootPath, mockConfig, mockDirectoryTree, mockFilteredDirectoryTree, fixedMtime }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('rootPath', mockRootPath);
      localStorage.setItem('configContent', mockConfig);
      localStorage.setItem('app.locale', 'en');

      const cloneTree = (treeItems) => JSON.parse(JSON.stringify(treeItems));
      const delay = (durationMs) =>
        new Promise((resolve) => window.setTimeout(resolve, durationMs));

      window.electronAPI = {
        getDefaultConfig: async () => mockConfig,
        selectDirectory: async () => mockRootPath,
        getDirectoryTree: async (_dirPath, configContent) => {
          const activeConfig =
            typeof configContent === 'string' && configContent.trim()
              ? configContent
              : localStorage.getItem('configContent') || '';
          const configLines = activeConfig
            .split('\n')
            .map((line) => line.trim().toLowerCase().replaceAll(' ', '').replaceAll('\t', ''));
          const hasSecretScanningDisabled = configLines.includes('enable_secret_scanning:false');
          const hasSuspiciousFilesDisabled = configLines.includes('exclude_suspicious_files:false');
          const excludeSensitiveFiles = !hasSecretScanningDisabled && !hasSuspiciousFilesDisabled;
          const tree = excludeSensitiveFiles ? mockFilteredDirectoryTree : mockDirectoryTree;
          return cloneTree(tree);
        },
        analyzeRepository: async (options = {}) => {
          const selectedFilePaths = Array.isArray(options?.selectedFiles)
            ? options.selectedFiles
            : [];
          const filesInfo = selectedFilePaths.map((filePath, index) => {
            const normalizedPath = String(filePath);
            const relativePath = normalizedPath.startsWith(`${mockRootPath}/`)
              ? normalizedPath.slice(mockRootPath.length + 1)
              : normalizedPath;
            return {
              path: relativePath,
              tokens: 120 * (index + 1),
              isBinary: false,
            };
          });

          return {
            totalFiles: filesInfo.length,
            totalTokens: filesInfo.reduce((sum, file) => sum + file.tokens, 0),
            filesInfo,
          };
        },
        processRepository: async (options = {}) => {
          const inputFilesInfo = Array.isArray(options?.filesInfo) ? options.filesInfo : [];
          const filesInfo = inputFilesInfo.map((file, index) => ({
            path: String(file?.path || `src/file-${index + 1}.ts`),
            tokens:
              Number.isFinite(file?.tokens) && Number(file.tokens) > 0
                ? Number(file.tokens)
                : 120 * (index + 1),
            isBinary: false,
          }));
          const totalTokens = filesInfo.reduce((sum, file) => sum + file.tokens, 0);
          const exportFormat = options?.options?.exportFormat === 'xml' ? 'xml' : 'markdown';
          const content =
            exportFormat === 'xml'
              ? [
                  '<?xml version="1.0" encoding="UTF-8"?>',
                  `<repository totalFiles="${filesInfo.length}" totalTokens="${totalTokens}">`,
                  ...filesInfo.map(
                    (file) =>
                      `  <file path="${file.path}" tokens="${file.tokens}"><![CDATA[// Preview for ${file.path}]]></file>`
                  ),
                  '</repository>',
                ].join('\n')
              : [
                  '# Repository Analysis',
                  '',
                  ...filesInfo.map(
                    (file) =>
                      `## ${file.path}\n\n\`\`\`ts\n// Preview for ${file.path}\n\`\`\`\nTokens: ${file.tokens}\n`
                  ),
                  '--END--',
                ].join('\n');

          return {
            content,
            exportFormat,
            totalTokens,
            processedFiles: filesInfo.length,
            skippedFiles: 0,
            filesInfo,
          };
        },
        countFilesTokens: async (options) => {
          const filePaths = Array.isArray(options?.filePaths) ? options.filePaths : [];
          const results = {};
          const stats = {};

          await delay(450);

          for (const filePath of filePaths) {
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
      mockFilteredDirectoryTree: MOCK_FILTERED_DIRECTORY_TREE,
      fixedMtime: FIXED_MTIME,
    }
  );
}

async function setLocaleAndWait(page, locale) {
  await page.selectOption(UI_SELECTORS.languageSelector, locale);
  await page.waitForFunction(
    ({ languageSelector, expectedLocale }) => {
      const localeSelector = document.querySelector(languageSelector);
      if (!(localeSelector instanceof HTMLSelectElement)) {
        return false;
      }

      return (
        localeSelector.value === expectedLocale &&
        localStorage.getItem('app.locale') === expectedLocale
      );
    },
    { languageSelector: UI_SELECTORS.languageSelector, expectedLocale: locale }
  );
}

async function setCheckboxState(page, selector, shouldBeChecked) {
  const checkbox = page.locator(selector).first();
  await checkbox.waitFor({ state: 'visible', timeout: 10000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const currentState = await checkbox.isChecked();
    if (currentState === shouldBeChecked) {
      return;
    }

    if (shouldBeChecked) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }

    await page.waitForTimeout(75);
  }

  throw new Error(
    `Unable to set checkbox "${selector}" to ${shouldBeChecked ? 'checked' : 'unchecked'}`
  );
}

async function captureLocaleScreenshots(page) {
  await runStep('Wait for language selector', async () => {
    await page.waitForSelector(UI_SELECTORS.languageSelector, { timeout: 10000 });
  });

  for (const locale of SUPPORTED_LOCALES) {
    await runStep(`Switch locale to ${locale}`, async () => {
      await setLocaleAndWait(page, locale);
    });

    await runStep(`Capture locale screenshot (${locale})`, async () => {
      await page.screenshot({ path: LOCALE_SCREENSHOT_PATHS[locale], fullPage: true });
    });
  }

  await runStep(`Reset locale to ${DEFAULT_LOCALE}`, async () => {
    await setLocaleAndWait(page, DEFAULT_LOCALE);
  });
}

async function captureAppStateScreenshots(page) {
  await runStep('Disable animations for stable screenshots', async () => {
    await page.evaluate(async (stylesheetHref) => {
      const existingStylesheet = document.querySelector('link[data-qa-disable-animations="true"]');
      if (existingStylesheet instanceof HTMLLinkElement) {
        return;
      }

      await new Promise((resolve, reject) => {
        const stylesheetLink = document.createElement('link');
        stylesheetLink.rel = 'stylesheet';
        stylesheetLink.href = stylesheetHref;
        stylesheetLink.setAttribute('data-qa-disable-animations', 'true');
        stylesheetLink.onload = resolve;
        stylesheetLink.onerror = () => {
          reject(new Error('Failed to load QA disable-animations stylesheet'));
        };
        document.head.appendChild(stylesheetLink);
      });
    }, QA_DISABLE_ANIMATIONS_STYLESHEET_PATH);
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

  await captureLocaleScreenshots(page);

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
    }, MOCK_VISIBLE_FILE_COUNT_WITH_SECRET_FILTER);
  });

  await runStep('Verify secret files are hidden by default', async () => {
    await page.waitForFunction(
      (selector) => !document.querySelector(selector),
      UI_SELECTORS.secretFileEntry
    );
  });

  await runStep('Capture source tab screenshot', async () => {
    await page.screenshot({ path: SCREENSHOTS.sourceTab, fullPage: true });
  });

  await runStep('Disable secret filtering in config tab', async () => {
    await page.click(UI_SELECTORS.configTab);
    await page.waitForSelector(UI_SELECTORS.secretScanningToggle, { timeout: 10000 });
    await setCheckboxState(page, UI_SELECTORS.secretScanningToggle, false);
    await setCheckboxState(page, UI_SELECTORS.suspiciousFilesToggle, false);
    await page.waitForFunction(
      ({ secretSelector, suspiciousSelector }) => {
        const secretToggle = document.querySelector(secretSelector);
        const suspiciousToggle = document.querySelector(suspiciousSelector);

        return (
          secretToggle instanceof HTMLInputElement &&
          suspiciousToggle instanceof HTMLInputElement &&
          !secretToggle.checked &&
          !suspiciousToggle.checked
        );
      },
      {
        secretSelector: UI_SELECTORS.secretScanningToggle,
        suspiciousSelector: UI_SELECTORS.suspiciousFilesToggle,
      }
    );
    await page.getByRole('button', { name: /save config|saved/i }).click();
    await page.waitForFunction(() => {
      const configContent = localStorage.getItem('configContent') || '';
      return (
        /(^|\n)\s*enable_secret_scanning\s*:\s*false\b/i.test(configContent) &&
        /(^|\n)\s*exclude_suspicious_files\s*:\s*false\b/i.test(configContent)
      );
    });
  });

  await runStep('Switch back to source tab and refresh file list', async () => {
    await page.click(UI_SELECTORS.sourceTab);
    await page.waitForSelector(UI_SELECTORS.refreshFileListButton, { timeout: 10000 });
    await page.click(UI_SELECTORS.refreshFileListButton);
  });

  await runStep('Verify secret file appears when filtering is disabled', async () => {
    await page.waitForSelector(UI_SELECTORS.secretFileEntry, { timeout: 10000 });
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

  await runStep('Verify process button shows selecting state during token counting', async () => {
    await page.waitForFunction((selector) => {
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }

      return (
        button.disabled &&
        /selecting files\.\.\./i.test(button.textContent || '') &&
        Boolean(button.querySelector('svg.animate-spin'))
      );
    }, UI_SELECTORS.processSelectedFilesButton);
  });

  await runStep('Verify process button re-enables after token counting completes', async () => {
    await page.waitForFunction((selector) => {
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }

      const buttonLabel = button.textContent || '';
      const hasSpinner = Boolean(button.querySelector('svg.animate-spin'));
      return !button.disabled && /process selected files/i.test(buttonLabel) && !hasSpinner;
    }, UI_SELECTORS.processSelectedFilesButton);
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

  await runStep('Return to desktop viewport before processing', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await runStep('Wait for process button to be enabled', async () => {
    await page.waitForFunction((selector) => {
      const button = document.querySelector(selector);
      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }
      return !button.disabled && /process selected files/i.test(button.textContent || '');
    }, UI_SELECTORS.processSelectedFilesButton);
  });

  await runStep('Process selected files', async () => {
    await page.locator(UI_SELECTORS.processSelectedFilesButton).first().click();
  });

  await runStep('Wait for processed panel to render', async () => {
    await page.waitForSelector(UI_SELECTORS.processedTabActive, { timeout: 10000 });
    await page.waitForSelector(UI_SELECTORS.processedContent, { timeout: 10000 });
  });

  await runStep('Capture processed tab screenshot', async () => {
    await page.screenshot({ path: SCREENSHOTS.processedTab, fullPage: true });
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
    const screenshotPaths = [
      SCREENSHOTS.configDefault,
      ...SUPPORTED_LOCALES.map((locale) => LOCALE_SCREENSHOT_PATHS[locale]),
      SCREENSHOTS.sourceTab,
      SCREENSHOTS.sourceSelected,
      SCREENSHOTS.sourceSelectedResized,
      SCREENSHOTS.processedTab,
    ];

    screenshotPaths.forEach((screenshotPath) => {
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
