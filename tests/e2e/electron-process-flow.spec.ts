import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from 'playwright/test';

type E2EFixtures = {
  electronApp: ElectronApplication;
  page: Page;
  projectDir: string;
  savePath: string;
  userDataDir: string;
};

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_ENTRY_PATH = path.join(REPO_ROOT, 'build', 'ts', 'main', 'index.js');

const ensureMainEntryExists = () => {
  if (!fs.existsSync(MAIN_ENTRY_PATH)) {
    throw new Error(
      `Missing Electron main entry at ${MAIN_ENTRY_PATH}. Run "npm run build:ts" before Playwright E2E.`
    );
  }
};

const sanitizeForPath = (value: string): string => {
  const normalizedValue = value.trim().toLowerCase();
  let output = '';
  let lastCharWasDash = false;

  for (const character of normalizedValue) {
    const isLowerCaseLetter = character >= 'a' && character <= 'z';
    const isNumber = character >= '0' && character <= '9';

    if (isLowerCaseLetter || isNumber) {
      output += character;
      lastCharWasDash = false;
      continue;
    }

    if (!lastCharWasDash) {
      output += '-';
      lastCharWasDash = true;
    }
  }

  while (output.startsWith('-')) {
    output = output.slice(1);
  }

  while (output.endsWith('-')) {
    output = output.slice(0, -1);
  }

  return output || 'run';
};

const getElectronLaunchArgs = (): string[] => {
  if (process.platform === 'linux') {
    // GitHub Linux runners do not expose setuid chrome-sandbox permissions to workspace files.
    return ['--no-sandbox', '--disable-setuid-sandbox', MAIN_ENTRY_PATH];
  }

  return [MAIN_ENTRY_PATH];
};

const writeFixtureFile = (projectDir: string, relativePath: string, content: string | Buffer) => {
  const filePath = path.join(projectDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (typeof content === 'string') {
    fs.writeFileSync(filePath, content, 'utf8');
    return;
  }
  fs.writeFileSync(filePath, content);
};

const createFixtureProject = (browserName: string): string => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), `ai-code-fusion-e2e-${browserName}-`));

  writeFixtureFile(
    projectDir,
    'src/App.tsx',
    [
      "export const APP_MARKER = 'APP_MARKER_V1';",
      '',
      'export function App() {',
      "  return <main>{APP_MARKER}</main>;",
      '}',
      '',
    ].join('\n')
  );
  writeFixtureFile(
    projectDir,
    'src/utils/helper.ts',
    [
      "export const HELPER_MARKER = 'HELPER_MARKER_V1';",
      '',
      'export const sum = (a: number, b: number) => a + b;',
      '',
    ].join('\n')
  );
  writeFixtureFile(projectDir, 'README.md', '# Fixture Project\n\nUsed for Electron E2E coverage.\n');
  writeFixtureFile(projectDir, '.gitignore', 'dist/\n*.log\n!important.log\n');
  writeFixtureFile(projectDir, '.env', 'LOCAL_TEST_VALUE=fixture\n');
  writeFixtureFile(projectDir, 'dist/bundle.js', 'console.log("should be excluded");\n');
  writeFixtureFile(projectDir, 'important.log', 'this file is intentionally present\n');
  writeFixtureFile(projectDir, 'assets/logo.bin', Buffer.from([0, 1, 2, 3, 4, 255]));

  return projectDir;
};

const stubNativeDialogs = async (
  electronApp: ElectronApplication,
  projectDir: string,
  savePath: string
) => {
  await electronApp.evaluate(
    ({ dialog }, { directoryPath, outputPath }) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directoryPath],
      });

      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: outputPath,
      });
    },
    { directoryPath: projectDir, outputPath: savePath }
  );
};

const configureFlowDefaults = async (
  page: Page,
  exportFormat: 'markdown' | 'xml' = 'markdown'
) => {
  await page.getByRole('tab', { name: 'Start' }).click();
  await page.getByLabel('Filter by file extensions').uncheck();
  await page.getByLabel('Use exclude patterns').check();
  await page.getByLabel('Apply .gitignore rules').check();
  await page.getByLabel('Scan content for secrets').check();
  await page.getByLabel('Exclude suspicious files').check();
  await page.getByLabel('Include file tree in output').check();
  await page.getByLabel('Display token counts').check();
  await page.getByLabel('Export format').selectOption(exportFormat);
  await page.getByRole('button', { name: /save config|saved/i }).click();
  await expect(page.getByLabel('Filter by file extensions')).not.toBeChecked();
  await expect(page.getByLabel('Export format')).toHaveValue(exportFormat);
};

const openFixtureProject = async (page: Page, exportFormat: 'markdown' | 'xml' = 'markdown') => {
  await configureFlowDefaults(page, exportFormat);
  await page.getByRole('button', { name: 'Select Folder' }).click();
  await expect(page.getByRole('tab', { name: 'Select Files' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Select All')).toBeVisible();
};

const selectSourceFiles = async (page: Page, fileNames: string[]) => {
  await page.getByRole('button', { name: /^Expand folder src$/i }).click();

  const utilsFolderToggle = page.getByRole('button', { name: /^Expand folder utils$/i });
  if ((await utilsFolderToggle.count()) > 0) {
    await utilsFolderToggle.first().click();
  }

  for (const fileName of fileNames) {
    const fileCheckbox = page.getByRole('checkbox', { name: fileName, exact: true });
    await fileCheckbox.check();
    await expect(fileCheckbox).toBeChecked();
  }

  await expect(page.locator('.file-tree')).toContainText(
    new RegExp(String.raw`${fileNames.length} of \d+ files selected`),
    { timeout: 15_000 }
  );

  const processButton = page.getByTestId('process-selected-files-button');
  await expect(processButton).toContainText(/process selected files/i, { timeout: 30_000 });
  await expect(processButton).toBeEnabled({ timeout: 30_000 });
  return processButton;
};

const processSelection = async (page: Page) => {
  const processButton = page.getByTestId('process-selected-files-button');
  await expect(processButton).toBeEnabled({ timeout: 30_000 });
  await processButton.click();

  await expect(page.getByRole('tab', { name: 'Processed Output' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  return page.locator('#processed-content pre');
};

const test = base.extend<E2EFixtures>({
  projectDir: async ({ browserName }, use) => {
    const projectDir = createFixtureProject(browserName);
    await use(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  },

  savePath: async ({ projectDir }, use, testInfo) => {
    const savePath = path.join(projectDir, `playwright-${sanitizeForPath(testInfo.title)}.md`);
    await use(savePath);
  },

  userDataDir: async ({ browserName }, use) => {
    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `ai-code-fusion-user-data-${browserName}-`)
    );
    await use(userDataDir);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  electronApp: async ({ projectDir, savePath, userDataDir }, use) => {
    ensureMainEntryExists();
    const launchEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_USER_DATA_PATH: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    };

    if (process.platform === 'linux') {
      launchEnv.ELECTRON_DISABLE_SANDBOX = 'true';
    }

    const electronApp = await electron.launch({
      args: getElectronLaunchArgs(),
      cwd: REPO_ROOT,
      env: launchEnv,
    });

    await stubNativeDialogs(electronApp, projectDir, savePath);

    await use(electronApp);
    await electronApp.close();
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      localStorage.setItem('app.locale', 'en');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'AI Code Fusion' })).toBeVisible();
    await use(page);
  },
});

test('processes selected files end-to-end with markdown output', async ({ page }) => {
  await openFixtureProject(page);

  await expect(page.getByText('.env', { exact: true })).toHaveCount(0);
  await expect(page.getByText('dist', { exact: true })).toHaveCount(0);

  await selectSourceFiles(page, ['App.tsx', 'helper.ts']);
  const processedContent = await processSelection(page);

  await expect(processedContent).toContainText('# Repository Content');
  await expect(processedContent).toContainText('src/App.tsx');
  await expect(processedContent).toContainText('src/utils/helper.ts');
  await expect(processedContent).toContainText('APP_MARKER_V1');
  await expect(processedContent).toContainText('HELPER_MARKER_V1');

  await expect(page.getByRole('cell', { name: 'src/App.tsx' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'src/utils/helper.ts' })).toBeVisible();
});

test('honors XML export format from config during full processing flow', async ({ page }) => {
  await openFixtureProject(page, 'xml');
  await selectSourceFiles(page, ['App.tsx']);
  const processedContent = await processSelection(page);

  await expect(processedContent).toContainText('<?xml version="1.0" encoding="UTF-8"?>');
  await expect(processedContent).toContainText('<repositoryContent>');
  await expect(processedContent).toContainText('<fileStructure><![CDATA[');
  await expect(processedContent).toContainText('<file path="src/App.tsx"');
  await expect(processedContent).toContainText('<summary totalTokens="');
});

test('refreshes processed output when source file changes on disk', async ({ page, projectDir }) => {
  await openFixtureProject(page);
  await selectSourceFiles(page, ['App.tsx']);
  const processedContent = await processSelection(page);

  await expect(processedContent).toContainText('APP_MARKER_V1');

  writeFixtureFile(
    projectDir,
    'src/App.tsx',
    [
      "export const APP_MARKER = 'APP_MARKER_V2';",
      '',
      'export function App() {',
      "  return <main>{APP_MARKER}</main>;",
      '}',
      '',
    ].join('\n')
  );

  await page.getByRole('button', { name: 'Refresh Code' }).click();
  await expect(processedContent).toContainText('APP_MARKER_V2');
});

test('saves processed output to disk through the native save flow', async ({ page, savePath }) => {
  await openFixtureProject(page);
  await selectSourceFiles(page, ['App.tsx']);
  await processSelection(page);

  await page.getByRole('button', { name: 'Save to File' }).click();

  await expect
    .poll(() => fs.existsSync(savePath), {
      timeout: 15_000,
      message: `Expected saved output to exist at ${savePath}`,
    })
    .toBe(true);

  const savedContent = fs.readFileSync(savePath, 'utf8');
  expect(savedContent).toContain('src/App.tsx');
  expect(savedContent).toContain('APP_MARKER_V1');
});

test('persists selected language across reloads', async ({ page }) => {
  const languageSelector = page.getByTestId('language-selector');
  await expect(languageSelector).toHaveValue('en');

  await languageSelector.selectOption('es');
  await expect(languageSelector).toHaveValue('es');
  await expect(page.getByRole('tab', { name: 'Inicio' })).toBeVisible();

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('language-selector')).toHaveValue('es');
  await expect(page.getByRole('tab', { name: 'Inicio' })).toBeVisible();
});
