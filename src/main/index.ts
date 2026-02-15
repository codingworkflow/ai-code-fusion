import fs from 'fs';
import { pathToFileURL } from 'node:url';
import path from 'path';

import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';

import { loadDefaultConfig } from '../utils/config-manager';
import { isBinaryFile } from '../utils/file-analyzer';
import { GitignoreParser } from '../utils/gitignore-parser';
import { TokenCounter } from '../utils/token-counter';

import { getErrorMessage } from './errors';
import { initializeUpdaterFeatureFlags } from './feature-flags';
import {
  isPathWithinRoot,
  isPathWithinTempRoot,
  resolveAuthorizedPath,
} from './security/path-guard';
import { getDirectoryTree } from './services/directory-tree';
import { testProviderConnection } from './services/provider-connection';
import { analyzeRepository } from './services/repository-analyzer';
import { processRepository } from './services/repository-processing';
import {
  createUpdaterService,
  resolveUpdaterRuntimeOptions,
  type UpdaterCheckEvent,
} from './updater';

import type {
  AnalyzeRepositoryOptions,
  AnalyzeRepositoryResult,
  CountFilesTokensOptions,
  CountFilesTokensResult,
  ProviderConnectionOptions,
  ProviderConnectionResult,
  ProcessRepositoryOptions,
  ProcessRepositoryResult,
  SaveFileOptions,
} from '../types/ipc';

// Initialize the gitignore parser
const gitignoreParser = new GitignoreParser();

// Create a singleton TokenCounter instance for reuse
const tokenCounter = new TokenCounter();

// Keep a global reference of the window object to avoid garbage collection
let mainWindow: BrowserWindow | null = null;
let authorizedRootPath: string | null = null;
const resolveAuthorizedPathForCurrentRoot = (candidatePath: string): string | null =>
  resolveAuthorizedPath(authorizedRootPath, candidatePath);

const logUpdaterCheckEvent = (event: UpdaterCheckEvent) => {
  const serializedEvent = JSON.stringify(event);
  if (event.event === 'updater_check_error') {
    console.warn(`[updater-check] ${serializedEvent}`);
    return;
  }

  console.info(`[updater-check] ${serializedEvent}`);
};

let updaterService = createUpdaterService(
  autoUpdater,
  resolveUpdaterRuntimeOptions({
    currentVersion: app.getVersion(),
    platform: process.platform,
    env: process.env,
  }),
  {
    onCheckEvent: logUpdaterCheckEvent,
  }
);

const APP_ROOT = path.resolve(__dirname, '../../..');
const RENDERER_INDEX_PATH = path.join(APP_ROOT, 'src', 'renderer', 'public', 'index.html');
const ASSETS_DIR = path.join(APP_ROOT, 'src', 'assets');
const createForbiddenAssetResponse = (): Response => new Response('Forbidden', { status: 403 });

// Set environment
const isDevelopment = process.env.NODE_ENV === 'development';
const e2eUserDataPath = process.env.ELECTRON_USER_DATA_PATH;

if (
  process.env.NODE_ENV === 'test' &&
  typeof e2eUserDataPath === 'string' &&
  e2eUserDataPath.trim().length > 0
) {
  const resolvedUserDataPath = path.resolve(e2eUserDataPath);

  if (isPathWithinTempRoot(resolvedUserDataPath)) {
    fs.mkdirSync(resolvedUserDataPath, { recursive: true });
    app.setPath('userData', resolvedUserDataPath);
  } else {
    console.warn(`Ignoring ELECTRON_USER_DATA_PATH outside temp root: ${resolvedUserDataPath}`);
  }
}

async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--app-dev-mode=${isDevelopment ? 'true' : 'false'}`],
    },
    autoHideMenuBar: true, // Hide the menu bar by default
    icon: path.join(ASSETS_DIR, 'icon.ico'), // Set the application icon
  });

  // Hide the menu bar completely in all modes
  mainWindow.setMenu(null);

  // Load the index.html file
  if (isDevelopment) {
    await mainWindow.loadFile(RENDERER_INDEX_PATH);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(RENDERER_INDEX_PATH);
  }

  // Window closed event
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Set app user model ID for Windows
if (process.platform === 'win32') {
  app.setAppUserModelId('com.ai.code.fusion');
}

const runStartupUpdateCheck = () => {
  if (!updaterService.shouldCheckOnStart) {
    return;
  }

  void updaterService.checkForUpdates().then((result) => {
    if (result.state === 'error') {
      console.warn(`Startup update check failed: ${result.errorMessage}`);
    } else if (result.state === 'update-available') {
      console.info(`Update available: ${result.latestVersion ?? 'unknown version'}`);
    }
  });
};

const initializeUpdater = async () => {
  try {
    const flagOverrides = await initializeUpdaterFeatureFlags({ env: process.env });
    updaterService = createUpdaterService(
      autoUpdater,
      resolveUpdaterRuntimeOptions({
        currentVersion: app.getVersion(),
        platform: process.platform,
        env: process.env,
        flagOverrides,
      }),
      {
        onCheckEvent: logUpdaterCheckEvent,
      }
    );
  } catch (error) {
    console.warn(`Failed to initialize OpenFeature updater flags: ${getErrorMessage(error)}`);
  } finally {
    runStartupUpdateCheck();
  }
};

const bootstrapApp = async () => {
  await app.whenReady();

  // Register assets protocol
  protocol.handle('assets', async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const hostSegment = decodeURIComponent(requestUrl.hostname);
      const pathSegment = requestUrl.pathname.replace(/^\/+/, '');
      const relativeAssetPath = decodeURIComponent(
        [hostSegment, pathSegment].filter((segment) => segment.length > 0).join('/')
      );
      const assetPath = path.normalize(path.join(ASSETS_DIR, relativeAssetPath));

      if (!isPathWithinRoot(ASSETS_DIR, assetPath)) {
        return createForbiddenAssetResponse();
      }

      try {
        return await net.fetch(pathToFileURL(assetPath).toString());
      } catch (error) {
        console.warn(`Failed to load asset from assets protocol: ${getErrorMessage(error)}`);
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.warn(`Rejected malformed assets protocol request: ${getErrorMessage(error)}`);
      return createForbiddenAssetResponse();
    }
  });

  await createWindow();
  await initializeUpdater();
};

void bootstrapApp();

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    void createWindow();
  }
});

ipcMain.handle('updater:getStatus', () => {
  return updaterService.getStatus();
});

ipcMain.handle('updater:check', async () => {
  return updaterService.checkForUpdates();
});

// IPC Event Handlers

ipcMain.handle(
  'provider:testConnection',
  async (_event, options: ProviderConnectionOptions): Promise<ProviderConnectionResult> => {
    return testProviderConnection(options, {
      fetch: (url, requestOptions) => net.fetch(url, requestOptions),
      onWarn: (message, context) => {
        console.warn(message, context);
      },
    });
  }
);

// Select directory dialog
ipcMain.handle('dialog:selectDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow ?? undefined, {
    properties: ['openDirectory'],
  });

  if (canceled) {
    return null;
  }

  const selectedPath = filePaths[0];
  authorizedRootPath = path.resolve(selectedPath);
  return selectedPath;
});

// Get directory tree
ipcMain.handle(
  'fs:getDirectoryTree',
  async (_event, dirPath: string, configContent?: string | null) => {
    const authorizedDirPath = resolveAuthorizedPathForCurrentRoot(dirPath);
    if (!authorizedDirPath) {
      console.warn(`Rejected unauthorized directory tree request: ${dirPath}`);
      return [];
    }

    return getDirectoryTree({
      rootPath: authorizedDirPath,
      configContent,
      gitignoreParser,
      onWarn: (message: string) => {
        console.warn(message);
      },
      onError: (message: string, error?: unknown) => {
        console.error(message, error);
      },
    });
  }
);

// Analyze repository
ipcMain.handle(
  'repo:analyze',
  async (
    _event,
    { rootPath, configContent, selectedFiles }: AnalyzeRepositoryOptions
  ): Promise<AnalyzeRepositoryResult> => {
    try {
      const authorizedAnalyzeRoot = resolveAuthorizedPathForCurrentRoot(rootPath);
      if (!authorizedAnalyzeRoot) {
        throw new Error('Unauthorized root path. Please select the directory again.');
      }

      return analyzeRepository({
        rootPath: authorizedAnalyzeRoot,
        configContent,
        selectedFiles,
        gitignoreParser,
        onWarn: (message: string) => {
          console.warn(message);
        },
        onInfo: (message: string) => {
          console.info(message);
        },
      });
    } catch (error) {
      console.error('Error analyzing repository:', error);
      throw error;
    }
  }
);

// Process repository
ipcMain.handle(
  'repo:process',
  async (
    _event,
    { rootPath, filesInfo, treeView, options = {} }: ProcessRepositoryOptions
  ): Promise<ProcessRepositoryResult> => {
    try {
      const authorizedProcessRoot = resolveAuthorizedPathForCurrentRoot(rootPath);
      if (!authorizedProcessRoot) {
        throw new Error('Unauthorized root path. Please select the directory again.');
      }

      return processRepository({
        rootPath: authorizedProcessRoot,
        filesInfo,
        treeView,
        options,
        onWarn: (message: string) => {
          console.warn(message);
        },
        onInfo: (message: string, metadata?: unknown) => {
          console.info(message, metadata);
        },
      });
    } catch (error) {
      console.error('Error processing repository:', error);
      throw error;
    }
  }
);

// Save output to file
ipcMain.handle('fs:saveFile', async (_event, { content, defaultPath }: SaveFileOptions) => {
  const safeDefaultPath = typeof defaultPath === 'string' ? defaultPath : '';
  const defaultExtension = safeDefaultPath ? path.extname(safeDefaultPath).toLowerCase() : '';
  const filters =
    defaultExtension === '.xml'
      ? [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ]
      : [
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ];

  const { canceled, filePath } = mainWindow
    ? await dialog.showSaveDialog(mainWindow, {
        defaultPath: safeDefaultPath,
        filters,
      })
    : await dialog.showSaveDialog({
        defaultPath: safeDefaultPath,
        filters,
      });

  if (canceled || !filePath) {
    return null;
  }

  fs.writeFileSync(filePath, content);
  return filePath;
});

// Reset gitignore cache
ipcMain.handle('gitignore:resetCache', () => {
  gitignoreParser.clearCache();
  return true;
});

// Get default configuration
ipcMain.handle('config:getDefault', async () => {
  try {
    return loadDefaultConfig();
  } catch (error) {
    console.error('Error loading default config:', error);
    throw error;
  }
});

// Get path to an asset
ipcMain.handle('assets:getPath', (_event, assetName: string) => {
  try {
    const assetPath = path.join(ASSETS_DIR, assetName);
    if (!isPathWithinRoot(ASSETS_DIR, assetPath)) {
      console.warn(`Rejected asset path outside assets directory: ${assetName}`);
      return null;
    }

    if (fs.existsSync(assetPath)) {
      return assetPath;
    }
    console.error(`Asset not found: ${assetName} at ${assetPath}`);
    return null;
  } catch (error) {
    console.error('Error getting asset path:', error);
    return null;
  }
});

// Count tokens for multiple files in a single call
ipcMain.handle(
  'tokens:countFiles',
  async (_event, options: CountFilesTokensOptions): Promise<CountFilesTokensResult> => {
    try {
      const { rootPath, filePaths } = options ?? {};
      if (!rootPath || !Array.isArray(filePaths) || filePaths.length === 0) {
        return { results: {}, stats: {} };
      }

      const authorizedTokensRoot = resolveAuthorizedPathForCurrentRoot(rootPath);
      if (!authorizedTokensRoot) {
        console.warn(`Rejected unauthorized token count request for root: ${rootPath}`);
        return { results: {}, stats: {} };
      }

      const results: Record<string, number> = {};
      const stats: Record<string, { size: number; mtime: number }> = {};

      // Process each file
      for (const filePath of filePaths) {
        try {
          const resolvedFilePath = path.resolve(authorizedTokensRoot, filePath);

          if (!isPathWithinRoot(authorizedTokensRoot, resolvedFilePath)) {
            console.warn(`Skipping file outside current root directory: ${filePath}`);
            results[filePath] = 0;
            continue;
          }

          // Check if file exists
          if (!fs.existsSync(resolvedFilePath)) {
            console.warn(`File not found for token counting: ${filePath}`);
            results[filePath] = 0;
            continue;
          }

          // Get file stats
          const fileStats = fs.statSync(resolvedFilePath);
          stats[filePath] = {
            size: fileStats.size,
            mtime: fileStats.mtime.getTime(), // Modification time for cache validation
          };

          // Skip binary files
          if (isBinaryFile(resolvedFilePath)) {
            console.log(`Skipping binary file for token counting: ${filePath}`);
            results[filePath] = 0;
            continue;
          }

          // Read file content
          const content = fs.readFileSync(resolvedFilePath, { encoding: 'utf-8', flag: 'r' });

          // Count tokens using the singleton token counter
          const tokenCount = tokenCounter.countTokens(content);
          results[filePath] = tokenCount;
        } catch (error) {
          console.error(`Error counting tokens for file ${filePath}:`, error);
          results[filePath] = 0;
        }
      }

      return { results, stats };
    } catch (error) {
      console.error(`Error counting tokens for files:`, error);
      return { results: {}, stats: {} };
    }
  }
);
