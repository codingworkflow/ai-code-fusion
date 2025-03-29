const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const yaml = require('yaml');
const { TokenCounter } = require('../utils/token-counter');
const { FileAnalyzer } = require('../utils/file-analyzer');
const { ContentProcessor } = require('../utils/content-processor');
const { GitignoreParser } = require('../utils/gitignore-parser');
const { matchPattern, matchCompiledPattern } = require('../utils/pattern-matcher');

// Initialize the gitignore parser
const gitignoreParser = new GitignoreParser();

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;

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
    },
    autoHideMenuBar: true, // Hide the menu bar by default
    icon: path.join(__dirname, '../assets/icon.ico'), // Set the application icon
  });

  // Hide the menu bar completely in all modes
  mainWindow.setMenu(null);

  // Load the index.html file
  if (isDevelopment) {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
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
app.whenReady().then(createWindow);

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

// IPC Event Handlers

// Select directory dialog
ipcMain.handle('dialog:selectDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });

  if (canceled) {
    return null;
  }

  return filePaths[0];
});

// Get directory tree
ipcMain.handle('fs:getDirectoryTree', async (_, dirPath, configContent) => {
  // IMPORTANT: This function applies exclude patterns to the directory tree,
  // preventing node_modules, .git, and other large directories from being included
  // in the UI tree view. This is critical for performance with large repositories.

  // Parse config to get settings and exclude patterns
  let patternSets;
  try {
    const config = configContent ? yaml.parse(configContent) : { exclude_patterns: [] };

    // Check if we should use custom excludes (default to true if not specified)
    const useCustomExcludes = config.use_custom_excludes !== false;

    // Check if we should use gitignore (default to false if not specified)
    const useGitignore = config.use_gitignore === true;

    // Initialize pattern sets object with default patterns
    patternSets = {
      defaultExcludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      customExcludePatterns: [],
      gitignoreExcludePatterns: [],
      gitignoreIncludePatterns: [],
      useCustomExcludes,
      useGitignore
    };

    // Add custom exclude patterns if enabled
    if (useCustomExcludes && config.exclude_patterns && Array.isArray(config.exclude_patterns)) {
      patternSets.customExcludePatterns = config.exclude_patterns;
    }

    // Add gitignore patterns if enabled
    if (useGitignore) {
      const gitignoreResult = gitignoreParser.parseGitignore(dirPath);
      
      if (gitignoreResult.excludePatterns && gitignoreResult.excludePatterns.length > 0) {
        patternSets.gitignoreExcludePatterns = gitignoreResult.excludePatterns;
        patternSets.compiledGitignoreExcludePatterns = gitignoreResult.compiledExcludePatterns;
      }

      // Add negated patterns (includes)
      if (gitignoreResult.includePatterns && gitignoreResult.includePatterns.length > 0) {
        patternSets.gitignoreIncludePatterns = gitignoreResult.includePatterns;
        patternSets.compiledGitignoreIncludePatterns = gitignoreResult.compiledIncludePatterns;
      }
    }
    
    // Create combined patterns arrays for backward compatibility
    patternSets.allExcludePatterns = [
      ...patternSets.defaultExcludePatterns,
      ...(useCustomExcludes ? patternSets.customExcludePatterns : []),
      ...(useGitignore ? patternSets.gitignoreExcludePatterns : [])
    ];
  } catch (error) {
    console.error('Error parsing config:', error);
    // Fall back to default pattern sets
    patternSets = {
      defaultExcludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      customExcludePatterns: [],
      gitignoreExcludePatterns: [],
      gitignoreIncludePatterns: [],
      allExcludePatterns: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      useCustomExcludes: true,
      useGitignore: false
    };
  }

  // Helper function to check if a path should be excluded
  const shouldExclude = (itemPath, itemName) => {
    // Use our consistent path normalization function
    const normalizedPath = getRelativePath(itemPath, dirPath);

    // Check for common directories to exclude
    if (['node_modules', '.git', 'dist', 'build'].includes(itemName)) {
      return true;
    }

    // Special case for root-level files
    const isRootLevelFile = normalizedPath.indexOf('/') === -1;

    // First check if path is in gitignore include patterns (negated patterns)
    // These have highest priority as per gitignore standard behavior
    if (patternSets.useGitignore && patternSets.gitignoreIncludePatterns.length > 0) {
      // Use compiled patterns if available for better performance
      if (patternSets.compiledGitignoreIncludePatterns && patternSets.compiledGitignoreIncludePatterns.length > 0) {
        for (const compiledPattern of patternSets.compiledGitignoreIncludePatterns) {
          if (matchCompiledPattern(normalizedPath, compiledPattern) || 
              matchCompiledPattern(itemName, compiledPattern)) {
            return false; // Include this file (don't exclude)
          }
        }
      } else {
        // Fall back to standard matching if compiled patterns aren't available
        for (const pattern of patternSets.gitignoreIncludePatterns) {
          if (matchPattern(normalizedPath, pattern) || matchPattern(itemName, pattern)) {
            return false; // Include this file (don't exclude)
          }
        }
      }
    }

    // Then check all exclude patterns (default + custom + gitignore)
    // This implements the "exclusion is a SUM" principle
    for (const pattern of patternSets.allExcludePatterns) {
      if (matchPattern(normalizedPath, pattern) || matchPattern(itemName, pattern)) {
        return true; // Exclude this file
      }
    }
    
    return false; // Default to including the file
  };

  const walkDirectory = (dir) => {
    const items = fs.readdirSync(dir);
    const result = [];

    for (const item of items) {
      try {
        const itemPath = path.join(dir, item);

        // Skip excluded items based on patterns, but don't exclude binary files from the tree
        if (shouldExclude(itemPath, item)) {
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
    return walkDirectory(dirPath);
  } catch (error) {
    console.error('Error getting directory tree:', error);
    return [];
  }
});

// Utility function to normalize paths consistently
const normalizePath = (inputPath) => {
  return inputPath.replace(/\\/g, '/');
};

// Utility function to get relative path consistently
const getRelativePath = (filePath, rootPath) => {
  const relativePath = path.relative(rootPath, filePath);
  return normalizePath(relativePath);
};

// Analyze repository
ipcMain.handle('repo:analyze', async (_, { rootPath, configContent, selectedFiles }) => {
  try {
    const config = yaml.parse(configContent);
    const tokenCounter = new TokenCounter();

    // Process gitignore if enabled
    let gitignorePatterns = { excludePatterns: [], includePatterns: [] };
    if (config.use_gitignore === true) {
      gitignorePatterns = gitignoreParser.parseGitignore(rootPath);
    }

    // Create a file analyzer instance with the appropriate settings
    const fileAnalyzer = new FileAnalyzer(config, tokenCounter, {
      useGitignore: config.use_gitignore === true,
      gitignorePatterns: gitignorePatterns,
    });

    // If selectedFiles is provided, only analyze those files
    const filesInfo = [];
    let totalTokens = 0;
    let skippedBinaryFiles = 0;

    for (const filePath of selectedFiles) {
      // Verify the file is within the current root path
      if (!filePath.startsWith(rootPath)) {
        console.warn(`Skipping file outside current root directory: ${filePath}`);
        continue;
      }

      // Use consistent path normalization
      const relativePath = getRelativePath(filePath, rootPath);

      // For binary files, record them as skipped but don't prevent selection
      let isBinary = false;
      if (!fileAnalyzer.shouldReadFile(filePath)) {
        console.log(`Binary file detected (will skip processing): ${relativePath}`);
        isBinary = true;
        skippedBinaryFiles++;
      }

      if (isBinary) {
        // For binary files, add to filesInfo but with zero tokens and a flag
        filesInfo.push({
          path: relativePath,
          tokens: 0,
          isBinary: true,
        });
      } else if (fileAnalyzer.shouldProcessFile(relativePath)) {
        const tokenCount = fileAnalyzer.analyzeFile(filePath);

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
});

// Process repository
ipcMain.handle('repo:process', async (_, { rootPath, filesInfo, treeView, options = {} }) => {
  try {
    const tokenCounter = new TokenCounter();
    const contentProcessor = new ContentProcessor(tokenCounter);

    // Ensure options is an object with default values if missing
    const processingOptions = {
      showTokenCount: options.showTokenCount !== false, // Default to true if not explicitly false
    };

    console.log('Processing with options:', processingOptions);

    let processedContent = '# Repository Content\n\n';

    // Add tree view if provided
    if (treeView) {
      processedContent += '## File Structure\n\n';
      processedContent += '```\n';
      processedContent += treeView;
      processedContent += '```\n\n';
      processedContent += '## File Contents\n\n';
    }

    let totalTokens = 0;
    let processedFiles = 0;
    let skippedFiles = 0;

    for (const { path: filePath, tokens } of filesInfo) {
      try {
        // Use consistent path joining
        const fullPath = path.join(rootPath, filePath);

        // Validate the full path is within the root path
        if (!normalizePath(fullPath).startsWith(normalizePath(rootPath))) {
          console.warn(`Skipping file outside root directory: ${filePath}`);
          skippedFiles++;
          continue;
        }

        if (fs.existsSync(fullPath)) {
          const content = contentProcessor.processFile(fullPath, filePath, processingOptions);

          if (content) {
            processedContent += content;
            totalTokens += tokens;
            processedFiles++;
          }
        } else {
          console.warn(`File not found: ${filePath}`);
          skippedFiles++;
        }
      } catch (error) {
        console.warn(`Failed to process ${filePath}: ${error.message}`);
        skippedFiles++;
      }
    }

    processedContent += '\n--END--\n';
    processedContent += `Total tokens: ${totalTokens}\n`;
    processedContent += `Processed files: ${processedFiles}\n`;

    if (skippedFiles > 0) {
      processedContent += `Skipped files: ${skippedFiles}\n`;
    }

    return {
      content: processedContent,
      totalTokens,
      processedFiles,
      skippedFiles,
    };
  } catch (error) {
    console.error('Error processing repository:', error);
    throw error;
  }
});

// Save output to file
ipcMain.handle('fs:saveFile', async (_, { content, defaultPath }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath,
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (canceled) {
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
