import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { autoUpdater } from 'electron-updater';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { createUpdaterService, resolveUpdaterRuntimeOptions } from './updater';
import { loadDefaultConfig } from '../utils/config-manager';
import { ContentProcessor } from '../utils/content-processor';
import { FileAnalyzer, isBinaryFile } from '../utils/file-analyzer';
import { getRelativePath, shouldExclude } from '../utils/filter-utils';
import { GitignoreParser } from '../utils/gitignore-parser';
import { TokenCounter } from '../utils/token-counter';
import {
  normalizeExportFormat,
  normalizeTokenCount,
  toXmlNumericAttribute,
  wrapXmlCdata,
} from '../utils/export-format';
import type {
  AnalyzeRepositoryOptions,
  AnalyzeRepositoryResult,
  ConfigObject,
  CountFilesTokensOptions,
  CountFilesTokensResult,
  DirectoryTreeItem,
  FileInfo,
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

const updaterService = createUpdaterService(
  autoUpdater,
  resolveUpdaterRuntimeOptions({
    currentVersion: app.getVersion(),
    platform: process.platform,
    env: process.env,
  })
);

const APP_ROOT = path.resolve(__dirname, '../../..');
const RENDERER_INDEX_PATH = path.join(APP_ROOT, 'src', 'renderer', 'index.html');
const ASSETS_DIR = path.join(APP_ROOT, 'src', 'assets');
const PUBLIC_ASSETS_DIR = path.join(APP_ROOT, 'public', 'assets');

// Set environment
const isDevelopment = process.env.NODE_ENV === 'development';

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

// Create window when Electron is ready
app.whenReady().then(() => {
  // Register assets protocol
  protocol.registerFileProtocol('assets', (request, callback) => {
    const url = request.url.replace('assets://', '');
    const assetPath = path.normalize(path.join(PUBLIC_ASSETS_DIR, url));
    if (!isPathWithinRoot(PUBLIC_ASSETS_DIR, assetPath)) {
      callback({ error: -6 });
      return;
    }
    callback({ path: assetPath });
  });

  void createWindow();

  if (updaterService.shouldCheckOnStart) {
    void updaterService.checkForUpdates().then((result) => {
      if (result.state === 'error') {
        console.warn(`Startup update check failed: ${result.errorMessage}`);
      } else if (result.state === 'update-available') {
        console.info(`Update available: ${result.latestVersion ?? 'unknown version'}`);
      }
    });
  }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle('updater:getStatus', () => {
  return updaterService.getStatus();
});

ipcMain.handle('updater:check', async () => {
  return updaterService.checkForUpdates();
});

// IPC Event Handlers

type FilterPatternBundle = string[] & { includePatterns?: string[]; includeExtensions?: string[] };

const resolveAuthorizedPath = (candidatePath: string): string | null => {
  if (!authorizedRootPath || !candidatePath) {
    return null;
  }

  const resolvedCandidatePath = path.resolve(candidatePath);
  if (!isPathWithinRoot(authorizedRootPath, resolvedCandidatePath)) {
    return null;
  }

  return resolvedCandidatePath;
};

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
    const authorizedDirPath = resolveAuthorizedPath(dirPath);
    if (!authorizedDirPath) {
      console.warn(`Rejected unauthorized directory tree request: ${dirPath}`);
      return [];
    }

    // IMPORTANT: This function applies exclude patterns to the directory tree,
    // preventing node_modules, .git, and other large directories from being included
    // in the UI tree view. This is critical for performance with large repositories.

    // Parse config to get settings and exclude patterns
    let excludePatterns: FilterPatternBundle = [];
    let config: ConfigObject = { exclude_patterns: [] };
    try {
      config = (configContent
        ? (yaml.parse(configContent) as ConfigObject)
        : ({ exclude_patterns: [] } as ConfigObject)) || { exclude_patterns: [] };

      // Check if we should use custom excludes (default to true if not specified)
      const useCustomExcludes = config.use_custom_excludes !== false;

      // Check if we should use custom includes (default to true if not specified)
      const useCustomIncludes = config.use_custom_includes !== false;

      // Check if we should use gitignore (default to true if not specified)
      const useGitignore = config.use_gitignore !== false;

      // Start with empty excludePatterns array (no hardcoded patterns)
      // Add custom exclude patterns if enabled
      if (useCustomExcludes && config.exclude_patterns && Array.isArray(config.exclude_patterns)) {
        excludePatterns = [...excludePatterns, ...config.exclude_patterns];
      }

      // Store include extensions for filtering later (if enabled)
      if (
        useCustomIncludes &&
        config.include_extensions &&
        Array.isArray(config.include_extensions)
      ) {
        excludePatterns.includeExtensions = config.include_extensions;
      }

      // Add gitignore patterns if enabled
      if (useGitignore) {
        const gitignoreResult = gitignoreParser.parseGitignore(authorizedDirPath);
        if (gitignoreResult.excludePatterns && gitignoreResult.excludePatterns.length > 0) {
          excludePatterns = [...excludePatterns, ...gitignoreResult.excludePatterns];
        }

        // Handle negated patterns (these will be processed later to override excludes)
        if (gitignoreResult.includePatterns && gitignoreResult.includePatterns.length > 0) {
          // We'll store includePatterns separately to process later
          excludePatterns.includePatterns = gitignoreResult.includePatterns;
        }
      }
    } catch (error) {
      console.error('Error parsing config:', error);
      // Fall back to only hiding .git folder
      excludePatterns = ['**/.git/**'];
      config = { exclude_patterns: [] };
    }

    // Use the shared shouldExclude function from filter-utils
    const localShouldExclude = (itemPath: string) => {
      return shouldExclude(itemPath, authorizedDirPath, excludePatterns, config);
    };

    const walkDirectory = (dir: string): DirectoryTreeItem[] => {
      const items = fs.readdirSync(dir);
      const result: DirectoryTreeItem[] = [];

      for (const item of items) {
        try {
          const itemPath = path.join(dir, item);

          // Skip excluded items based on patterns, but don't exclude binary files from the tree
          if (localShouldExclude(itemPath)) {
            continue;
          }

          const stats = fs.statSync(itemPath);
          const ext = path.extname(item).toLowerCase();

          if (stats.isDirectory()) {
            const children = walkDirectory(itemPath);
            // Only include directory if it has children or if we want to show empty dirs
            if (children.length > 0) {
              result.push({
                name: item,
                path: itemPath,
                type: 'directory',
                size: stats.size,
                lastModified: stats.mtime,
                children: children,
                itemCount: children.length,
              });
            }
          } else {
            result.push({
              name: item,
              path: itemPath,
              type: 'file',
              size: stats.size,
              lastModified: stats.mtime,
              extension: ext,
            });
          }
        } catch (err) {
          console.error(`Error processing ${path.join(dir, item)}:`, err);
          // Continue with next file instead of breaking
        }
      }

      // Sort directories first, then files alphabetically
      return result.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
    };

    try {
      return walkDirectory(authorizedDirPath);
    } catch (error) {
      console.error('Error getting directory tree:', error);
      return [];
    }
  }
);

const isPathWithinRoot = (rootPath: string, candidatePath: string): boolean => {
  if (!rootPath || !candidatePath) {
    return false;
  }

  const resolveForBoundaryCheck = (inputPath: string): string => {
    const resolvedPath = path.resolve(inputPath);
    const realpathFn = fs.realpathSync?.native ?? fs.realpathSync;

    if (typeof realpathFn === 'function') {
      try {
        return realpathFn(resolvedPath);
      } catch {
        return resolvedPath;
      }
    }

    return resolvedPath;
  };

  const resolvedRootPath = resolveForBoundaryCheck(rootPath);
  const resolvedCandidatePath = resolveForBoundaryCheck(candidatePath);
  const relativePath = path.relative(resolvedRootPath, resolvedCandidatePath);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

// Analyze repository
ipcMain.handle(
  'repo:analyze',
  async (
    _event,
    { rootPath, configContent, selectedFiles }: AnalyzeRepositoryOptions
  ): Promise<AnalyzeRepositoryResult> => {
    try {
      const authorizedAnalyzeRoot = resolveAuthorizedPath(rootPath);
      if (!authorizedAnalyzeRoot) {
        throw new Error('Unauthorized root path. Please select the directory again.');
      }

      const config = (yaml.parse(configContent) || {}) as ConfigObject;
      const localTokenCounter = new TokenCounter();

      // Process gitignore if enabled
      let gitignorePatterns = { excludePatterns: [], includePatterns: [] };
      if (config.use_gitignore !== false) {
        gitignorePatterns = gitignoreParser.parseGitignore(authorizedAnalyzeRoot);
      }

      // Create a file analyzer instance with the appropriate settings
      const fileAnalyzer = new FileAnalyzer(config, localTokenCounter, {
        useGitignore: config.use_gitignore !== false,
        gitignorePatterns: gitignorePatterns,
      });

      // If selectedFiles is provided, only analyze those files
      const filesInfo: FileInfo[] = [];
      let totalTokens = 0;
      let skippedBinaryFiles = 0;

      for (const filePath of selectedFiles) {
        const resolvedFilePath = path.resolve(authorizedAnalyzeRoot, filePath);

        // Verify the file is within the current root path
        if (!isPathWithinRoot(authorizedAnalyzeRoot, resolvedFilePath)) {
          console.warn(`Skipping file outside current root directory: ${filePath}`);
          continue;
        }

        // Use consistent path normalization
        const relativePath = getRelativePath(resolvedFilePath, authorizedAnalyzeRoot);

        // For binary files, record them as skipped but don't prevent selection
        const binaryFile = isBinaryFile(resolvedFilePath);
        if (binaryFile) {
          console.log(`Binary file detected (will skip processing): ${relativePath}`);
          skippedBinaryFiles++;
        }

        if (binaryFile) {
          // For binary files, add to filesInfo but with zero tokens and a flag
          filesInfo.push({
            path: relativePath,
            tokens: 0,
            isBinary: true,
          });
        } else if (fileAnalyzer.shouldProcessFile(relativePath)) {
          const tokenCount = fileAnalyzer.analyzeFile(resolvedFilePath);

          if (tokenCount !== null) {
            filesInfo.push({
              path: relativePath,
              tokens: tokenCount,
            });

            totalTokens += tokenCount;
          }
        }
      }

      // Sort by token count
      filesInfo.sort((a, b) => b.tokens - a.tokens);

      console.log(`Skipped ${skippedBinaryFiles} binary files during analysis`);

      return {
        filesInfo,
        totalTokens,
        skippedBinaryFiles,
      };
    } catch (error) {
      console.error('Error analyzing repository:', error);
      throw error;
    }
  }
);

// Helper function to generate tree view from filesInfo
function generateTreeView(filesInfo: FileInfo[]): string {
  if (!filesInfo || !Array.isArray(filesInfo)) {
    return '';
  }

  // Generate a more structured tree view from filesInfo
  const sortedFiles = [...filesInfo].sort((a, b) => a.path.localeCompare(b.path));

  // Build a path tree
  interface PathTree {
    [key: string]: PathTree | null;
  }
  const pathTree: PathTree = {};
  sortedFiles.forEach((file) => {
    if (!file || !file.path) return;

    const parts = file.path.split('/');
    let currentLevel: PathTree = pathTree;

    parts.forEach((part, index) => {
      if (!currentLevel[part]) {
        currentLevel[part] = index === parts.length - 1 ? null : {};
      }

      if (index < parts.length - 1) {
        const nextLevel = currentLevel[part];
        if (nextLevel) {
          currentLevel = nextLevel;
        }
      }
    });
  });

  // Recursive function to print the tree
  const printTree = (tree: PathTree, prefix = '', _isLast = true): string => {
    const entries = Object.entries(tree);
    let result = '';

    entries.forEach(([key, value], index) => {
      const isLastItem = index === entries.length - 1;

      // Print current level
      result += `${prefix}${isLastItem ? '└── ' : '├── '}${key}\n`;

      // Print children
      if (value !== null) {
        const newPrefix = `${prefix}${isLastItem ? '    ' : '│   '}`;
        result += printTree(value, newPrefix, isLastItem);
      }
    });

    return result;
  };

  return printTree(pathTree);
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Process repository
ipcMain.handle(
  'repo:process',
  async (
    _event,
    { rootPath, filesInfo, treeView, options = {} }: ProcessRepositoryOptions
  ): Promise<ProcessRepositoryResult> => {
    try {
      const authorizedProcessRoot = resolveAuthorizedPath(rootPath);
      if (!authorizedProcessRoot) {
        throw new Error('Unauthorized root path. Please select the directory again.');
      }

      const tokenCounter = new TokenCounter();
      const contentProcessor = new ContentProcessor(tokenCounter);

      // Ensure options is an object with default values if missing
      const processingOptions = {
        showTokenCount: options.showTokenCount !== false, // Default to true if not explicitly false
        includeTreeView: options.includeTreeView === true,
        exportFormat: normalizeExportFormat(options.exportFormat),
      };

      console.log('Processing with options:', processingOptions);

      let processedContent = '';

      if (processingOptions.exportFormat === 'xml') {
        processedContent += '<?xml version="1.0" encoding="UTF-8"?>\n';
        processedContent += '<repositoryContent>\n';
      } else {
        processedContent += '# Repository Content\n\n';
      }

      // Add tree view if requested in options, whether provided or not
      if (processingOptions.includeTreeView) {
        const resolvedTreeView = treeView || generateTreeView(filesInfo);
        if (processingOptions.exportFormat === 'xml') {
          processedContent += `<fileStructure>${wrapXmlCdata(resolvedTreeView)}</fileStructure>\n`;
        } else {
          processedContent += '## File Structure\n\n';
          processedContent += '```\n';
          processedContent += resolvedTreeView;
          processedContent += '```\n\n';
        }
      }

      if (processingOptions.exportFormat === 'markdown' && processingOptions.includeTreeView) {
        processedContent += '## File Contents\n\n';
      }

      if (processingOptions.exportFormat === 'xml') {
        processedContent += '<files>\n';
      }

      let totalTokens = 0;
      let processedFiles = 0;
      let skippedFiles = 0;

      for (const fileInfo of filesInfo ?? []) {
        try {
          if (!fileInfo || !fileInfo.path) {
            console.warn('Skipping invalid file info entry');
            skippedFiles++;
            continue;
          }

          const filePath = fileInfo.path;
          const tokenCount = normalizeTokenCount(fileInfo.tokens);

          // Resolve and validate against root path to prevent traversal and prefix bypasses.
          const fullPath = path.resolve(authorizedProcessRoot, filePath);

          if (!isPathWithinRoot(authorizedProcessRoot, fullPath)) {
            console.warn(`Skipping file outside root directory: ${filePath}`);
            skippedFiles++;
            continue;
          }

          if (fs.existsSync(fullPath)) {
            const content = contentProcessor.processFile(fullPath, filePath, {
              exportFormat: processingOptions.exportFormat,
              showTokenCount: processingOptions.showTokenCount,
              tokenCount,
            });

            if (content) {
              processedContent += content;
              totalTokens += tokenCount;
              processedFiles++;
            }
          } else {
            console.warn(`File not found: ${filePath}`);
            skippedFiles++;
          }
        } catch (error) {
          console.warn(`Failed to process file: ${getErrorMessage(error)}`);
          skippedFiles++;
        }
      }

      if (processingOptions.exportFormat === 'xml') {
        processedContent += '</files>\n';
        processedContent +=
          `<summary totalTokens="${toXmlNumericAttribute(totalTokens)}" ` +
          `processedFiles="${toXmlNumericAttribute(processedFiles)}" ` +
          `skippedFiles="${toXmlNumericAttribute(skippedFiles)}" />\n`;
        processedContent += '</repositoryContent>\n';
      } else {
        processedContent += '\n--END--\n';
      }

      return {
        content: processedContent,
        exportFormat: processingOptions.exportFormat,
        totalTokens,
        processedFiles,
        skippedFiles,
        filesInfo: filesInfo, // Add filesInfo to the response
      };
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

      const authorizedTokensRoot = resolveAuthorizedPath(rootPath);
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
