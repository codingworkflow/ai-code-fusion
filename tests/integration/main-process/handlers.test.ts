const fs = require('fs');
const yaml = require('yaml');
const FAKE_GITHUB_TOKEN = ['ghp', 'AAAAAAAAAAAAAAAAAAAAAAAA'].join('_');

// Mock electron ipcMain
const mockIpcHandlers = {};
const mockProtocolHandlers = {};
const mockNetFetch = jest.fn();
const mockAutoUpdater = {
  checkForUpdates: jest.fn(),
  setFeedURL: jest.fn(),
  allowPrerelease: false,
  autoDownload: true,
  autoInstallOnAppQuit: false,
  channel: undefined,
};
const mockIpcMain = {
  handle: jest.fn((channel, handler) => {
    mockIpcHandlers[channel] = handler;
  }),
};

// Mock required dependencies
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn().mockResolvedValue(),
    on: jest.fn(),
    setAppUserModelId: jest.fn(),
    quit: jest.fn(),
    getVersion: jest.fn().mockReturnValue('0.2.0'),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(null),
    on: jest.fn(),
    setMenu: jest.fn(),
    webContents: {
      openDevTools: jest.fn(),
    },
  })),
  ipcMain: mockIpcMain,
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
  },
  protocol: {
    handle: jest.fn((scheme, handler) => {
      mockProtocolHandlers[scheme] = handler;
    }),
  },
  net: {
    fetch: mockNetFetch,
  },
}));

jest.mock('fs');
jest.mock('path', () => {
  const realPath = jest.requireActual('path');
  return {
    ...realPath,
    join: jest.fn().mockImplementation((...args) => args.join('/')),
    normalize: jest.fn().mockImplementation((p) => realPath.posix.normalize(p)),
    resolve: jest.fn().mockImplementation((...args) => realPath.posix.resolve(...args)),
    relative: jest.fn().mockImplementation((from, to) => realPath.posix.relative(from, to)),
    isAbsolute: jest
      .fn()
      .mockImplementation((candidatePath) => realPath.posix.isAbsolute(candidatePath)),
    extname: jest.fn().mockImplementation((filePath) => {
      const parts = filePath.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    }),
    basename: jest.fn().mockImplementation((filePath) => {
      const parts = filePath.split('/');
      return parts[parts.length - 1];
    }),
  };
});

jest.mock('yaml');
jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));

// Mock core utils
jest.mock('../../../src/utils/token-counter', () => ({
  TokenCounter: jest.fn().mockImplementation(() => ({
    countTokens: jest.fn().mockReturnValue(100),
  })),
}));

jest.mock('../../../src/utils/gitignore-parser', () => ({
  GitignoreParser: jest.fn().mockImplementation(() => ({
    parseGitignore: jest.fn().mockReturnValue({
      excludePatterns: ['node_modules/', '*.log'],
      includePatterns: ['important.log'],
    }),
    clearCache: jest.fn(),
  })),
}));

// Let's NOT mock the FileAnalyzer class - only mock the isBinaryFile function
// This is crucial for correctly testing binary file handling
jest.mock('../../../src/utils/file-analyzer', () => {
  // Get the original module
  const originalModule = jest.requireActual('../../../src/utils/file-analyzer');
  return {
    ...originalModule, // Keep the real FileAnalyzer class implementation
    isBinaryFile: jest.fn().mockImplementation((filePath) => {
      return filePath.endsWith('.png') || filePath.endsWith('.ico') || filePath.includes('binary');
    }),
  };
});

jest.mock('../../../src/utils/content-processor', () => ({
  ContentProcessor: jest.fn().mockImplementation(() => ({
    processFile: jest.fn().mockImplementation((filePath, relativePath, options = {}) => {
      if (options.exportFormat === 'xml') {
        if (filePath.includes('binary') || filePath.endsWith('.png') || filePath.endsWith('.ico')) {
          return `<file path="${relativePath}" binary="true"></file>\n`;
        }
        const tokenAttribute =
          options.showTokenCount === true && Number.isFinite(options.tokenCount)
            ? ` tokens="${options.tokenCount}"`
            : '';
        return `<file path="${relativePath}"${tokenAttribute} binary="false"><![CDATA[Mocked content]]></file>\n`;
      }

      if (filePath.includes('binary') || filePath.endsWith('.png') || filePath.endsWith('.ico')) {
        return `${relativePath} (binary file)\n[BINARY FILE]\n`;
      }
      return `${relativePath}\n\`\`\`\nMocked content\n\`\`\`\n`;
    }),
  })),
}));

// Import the main process AFTER setting up all mocks
require('../../../src/main/index');

const buildMockStats = ({
  isDirectory = false,
  isSymbolicLink = false,
  size = 1000,
}: {
  isDirectory?: boolean;
  isSymbolicLink?: boolean;
  size?: number;
} = {}) => ({
  isDirectory: () => isDirectory,
  isSymbolicLink: () => isSymbolicLink,
  size,
  mtime: new Date(),
});

describe('Main Process IPC Handlers', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockNetFetch.mockResolvedValue({ ok: true, status: 200, url: 'file:///mock/icon.png' });
    mockAutoUpdater.allowPrerelease = false;
    mockAutoUpdater.autoDownload = true;
    mockAutoUpdater.autoInstallOnAppQuit = false;
    mockAutoUpdater.channel = undefined;
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '0.2.1', releaseName: 'Mock Update' },
    });
    const { dialog } = require('electron');
    dialog.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/mock/repo'],
    });
    dialog.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/mock/repo/output.md',
    });

    // Basic mocks for file system
    fs.readdirSync.mockImplementation((dir) => {
      if (dir === '/mock/repo') {
        return ['src', 'node_modules', 'package.json', '.gitignore', 'important.log', 'debug.log'];
      } else if (dir === '/mock/repo/src') {
        return ['index.js', 'utils'];
      } else if (dir === '/mock/repo/src/utils') {
        return ['helpers.js'];
      } else if (dir === '/mock/repo/node_modules') {
        return ['react'];
      }
      return [];
    });

    const isDefaultDirectoryPath = (itemPath) =>
      itemPath.endsWith('src') ||
      itemPath.endsWith('utils') ||
      itemPath.endsWith('node_modules') ||
      itemPath.endsWith('react');

    fs.statSync.mockImplementation((itemPath) =>
      buildMockStats({ isDirectory: isDefaultDirectoryPath(itemPath) })
    );
    if (typeof fs.lstatSync !== 'function') {
      fs.lstatSync = jest.fn();
    }
    fs.lstatSync.mockImplementation((itemPath) =>
      buildMockStats({ isDirectory: isDefaultDirectoryPath(itemPath) })
    );

    if (typeof fs.realpathSync !== 'function') {
      fs.realpathSync = jest.fn();
    }
    fs.realpathSync.mockImplementation((inputPath) => inputPath);
    fs.realpathSync.native = fs.realpathSync;

    fs.existsSync.mockImplementation((path) => {
      return !path.includes('nonexistent');
    });

    fs.readFileSync.mockImplementation((path) => {
      if (path.endsWith('.js')) {
        return 'console.log("Hello world");';
      } else if (path.endsWith('.json')) {
        return '{"name": "test"}';
      } else if (path.endsWith('.log')) {
        return 'Log entry';
      } else if (path.endsWith('.gitignore')) {
        // Provide gitignore content with negated pattern
        return '*.log\n!important.log\nnode_modules/';
      }
      return '';
    });

    // Mock config parsing
    yaml.parse.mockImplementation(() => ({
      use_custom_excludes: true,
      use_custom_includes: true,
      use_gitignore: true,
      include_extensions: ['.js', '.jsx', '.json', '.log'], // Include .log extension
      exclude_patterns: ['**/node_modules/**'],
    }));

    const selectDirectoryHandler = mockIpcHandlers['dialog:selectDirectory'];
    if (selectDirectoryHandler) {
      await selectDirectoryHandler(null);
    }
  });

  describe('assets protocol', () => {
    test('should reject traversal in assets protocol requests', async () => {
      await Promise.resolve();
      const handler = mockProtocolHandlers['assets'];
      expect(handler).toBeDefined();

      const response = await handler({ url: 'assets://../../etc/passwd' });
      expect(response).toBeDefined();
      expect(response.status).toBe(403);
      expect(mockNetFetch).not.toHaveBeenCalled();
    });

    test('should resolve valid assets protocol requests', async () => {
      await Promise.resolve();
      const handler = mockProtocolHandlers['assets'];
      expect(handler).toBeDefined();

      const basicResponse = await handler({ url: 'assets://icon.png' });
      expect(basicResponse).toBeDefined();

      const nestedResponse = await handler({ url: 'assets://icons/png/512x512.png' });
      expect(nestedResponse).toBeDefined();

      const encodedResponse = await handler({ url: 'assets://icons/png/space%20file.png' });
      expect(encodedResponse).toBeDefined();

      expect(mockNetFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('assets/icon.png')
      );
      expect(mockNetFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('assets/icons/png/512x512.png')
      );
      expect(mockNetFetch).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('assets/icons/png/space%20file.png')
      );
    });

    test('should reject encoded traversal in assets protocol requests', async () => {
      await Promise.resolve();
      const handler = mockProtocolHandlers['assets'];
      expect(handler).toBeDefined();

      const response = await handler({ url: 'assets://%2e%2e%2f%2e%2e/etc/passwd' });
      expect(response).toBeDefined();
      expect(response.status).toBe(403);
      expect(mockNetFetch).not.toHaveBeenCalled();
    });

    test('should reject malformed assets protocol requests', async () => {
      await Promise.resolve();
      const handler = mockProtocolHandlers['assets'];
      expect(handler).toBeDefined();

      const response = await handler({ url: 'assets://host/%E0%A4%A' });
      expect(response).toBeDefined();
      expect(response.status).toBe(403);
      expect(mockNetFetch).not.toHaveBeenCalled();
    });

    test('should return 404 when asset fetch fails', async () => {
      await Promise.resolve();
      const handler = mockProtocolHandlers['assets'];
      expect(handler).toBeDefined();

      mockNetFetch.mockRejectedValueOnce(new Error('asset missing'));

      const response = await handler({ url: 'assets://icon.png' });
      expect(response).toBeDefined();
      expect(response.status).toBe(404);
    });
  });

  describe('fs:getDirectoryTree', () => {
    test('should filter directory tree based on config', async () => {
      // Setup
      const dirPath = '/mock/repo';
      const configContent = `
        use_custom_excludes: true
        use_gitignore: true
        include_extensions:
          - .js
          - .jsx
          - .json
          - .log
        exclude_patterns:
          - "**/node_modules/**"
      `;

      // Execute the handler
      const handler = mockIpcHandlers['fs:getDirectoryTree'];
      expect(handler).toBeDefined();

      const result = await handler(null, dirPath, configContent);

      // Verify
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Tree should include src but not node_modules
      const srcFolder = result.find((item) => item.name === 'src');
      expect(srcFolder).toBeDefined();

      const nodeModulesFolder = result.find((item) => item.name === 'node_modules');
      expect(nodeModulesFolder).toBeUndefined(); // Excluded by pattern

      // Should include package.json
      const packageJson = result.find((item) => item.name === 'package.json');
      expect(packageJson).toBeDefined();

      // Log files: important.log should be included (despite *.log pattern) because of gitignore negation
      // But debug.log should be excluded
      const importantLog = result.find((item) => item.name === 'important.log');
      const debugLog = result.find((item) => item.name === 'debug.log');

      expect(importantLog).toBeDefined();
      expect(debugLog).toBeUndefined();
    });

    test('should handle errors gracefully', async () => {
      // Setup
      const dirPath = '/nonexistent/directory';
      const configContent = '';

      // Mock implementation to simulate error
      fs.readdirSync.mockImplementation(() => {
        throw new Error('Directory not found');
      });

      // Execute
      const handler = mockIpcHandlers['fs:getDirectoryTree'];
      const result = await handler(null, dirPath, configContent);

      // Verify
      expect(result).toEqual([]);
    });

    test('should reject unauthorized directory tree requests', async () => {
      const handler = mockIpcHandlers['fs:getDirectoryTree'];
      const result = await handler(null, '/unauthorized/path', '');
      expect(result).toEqual([]);
    });

    test('should skip symlinks that resolve outside the selected root', async () => {
      fs.readdirSync.mockImplementation((dir) => {
        if (dir === '/mock/repo') {
          return ['src', 'outside-link'];
        }
        if (dir === '/mock/repo/src') {
          return ['index.js'];
        }
        return [];
      });

      fs.statSync.mockImplementation((itemPath) =>
        buildMockStats({ isDirectory: itemPath.endsWith('/src') })
      );
      fs.lstatSync.mockImplementation((itemPath) =>
        buildMockStats({
          isDirectory: itemPath.endsWith('/src'),
          isSymbolicLink: itemPath.endsWith('/outside-link'),
        })
      );
      fs.realpathSync.mockImplementation((inputPath) => {
        if (inputPath === '/mock/repo/outside-link') {
          return '/outside/world';
        }
        return inputPath;
      });
      fs.realpathSync.native = fs.realpathSync;

      const handler = mockIpcHandlers['fs:getDirectoryTree'];
      const result = await handler(null, '/mock/repo', '');

      expect(result.find((item) => item.name === 'src')).toBeDefined();
      expect(result.find((item) => item.name === 'outside-link')).toBeUndefined();
    });

    test('should avoid directory traversal loops caused by symlink cycles', async () => {
      let readdirCalls = 0;
      const maxReaddirCalls = 10;
      fs.readdirSync.mockImplementation((dir) => {
        readdirCalls += 1;
        if (readdirCalls > maxReaddirCalls) {
          throw new Error(`Exceeded directory traversal safety budget (${maxReaddirCalls})`);
        }

        if (dir === '/mock/repo') {
          return ['src', 'loop-link'];
        }
        if (dir === '/mock/repo/src') {
          return ['index.js'];
        }
        return [];
      });

      fs.statSync.mockImplementation((itemPath) =>
        buildMockStats({ isDirectory: itemPath.endsWith('/src') })
      );
      fs.lstatSync.mockImplementation((itemPath) =>
        buildMockStats({
          isDirectory: itemPath.endsWith('/src'),
          isSymbolicLink: itemPath.endsWith('/loop-link'),
        })
      );
      fs.realpathSync.mockImplementation((inputPath) => {
        if (inputPath === '/mock/repo/loop-link') {
          return '/mock/repo';
        }
        return inputPath;
      });
      fs.realpathSync.native = fs.realpathSync;

      const handler = mockIpcHandlers['fs:getDirectoryTree'];
      const result = await handler(null, '/mock/repo', '');

      expect(result.find((item) => item.name === 'src')).toBeDefined();
      expect(result.find((item) => item.name === 'loop-link')).toBeUndefined();
      expect(readdirCalls).toBeLessThanOrEqual(maxReaddirCalls);
    });
  });

  describe('updater handlers', () => {
    test('should expose updater status from runtime', async () => {
      const handler = mockIpcHandlers['updater:getStatus'];
      expect(handler).toBeDefined();

      const result = await handler(null);
      const platformSupported = process.platform === 'win32' || process.platform === 'darwin';

      expect(result).toEqual(
        expect.objectContaining({
          currentVersion: '0.2.0',
          channel: 'stable',
          allowPrerelease: false,
          platformSupported,
          enabled: platformSupported,
        })
      );
    });

    test('should check updates with platform-aware behavior', async () => {
      const handler = mockIpcHandlers['updater:check'];
      expect(handler).toBeDefined();

      const result = await handler(null);
      const platformSupported = process.platform === 'win32' || process.platform === 'darwin';

      if (platformSupported) {
        expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'github',
            owner: 'codingworkflow',
            repo: 'ai-code-fusion',
          })
        );
        expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
        expect(result).toEqual(
          expect.objectContaining({
            state: 'update-available',
            updateAvailable: true,
            latestVersion: '0.2.1',
          })
        );
      } else {
        expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
        expect(result).toEqual(
          expect.objectContaining({
            state: 'disabled',
            updateAvailable: false,
          })
        );
      }
    });
  });

  describe('provider:testConnection', () => {
    test('should validate required provider fields before running network checks', async () => {
      const handler = mockIpcHandlers['provider:testConnection'];
      expect(handler).toBeDefined();

      const result = await handler(null, {
        providerId: 'openai',
        model: '',
        apiKey: '',
      });

      expect(result).toEqual(
        expect.objectContaining({
          ok: false,
        })
      );
      expect(result.message).toContain('Model is required.');
      expect(result.message).toContain('API key is required for this provider.');
      expect(mockNetFetch).not.toHaveBeenCalled();
    });

    test('should test provider connectivity with provider-specific defaults', async () => {
      const handler = mockIpcHandlers['provider:testConnection'];
      expect(handler).toBeDefined();

      mockNetFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await handler(null, {
        providerId: 'openai',
        model: 'gpt-4o-mini',
        apiKey: FAKE_GITHUB_TOKEN,
      });

      expect(mockNetFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
            Authorization: `Bearer ${FAKE_GITHUB_TOKEN}`,
          }),
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          ok: true,
          status: 200,
        })
      );
    });
  });

  describe('repo:analyze', () => {
    test('should analyze selected files correctly', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const configContent = `
        use_custom_excludes: true
        use_gitignore: true
        include_extensions:
          - .js
          - .jsx
          - .json
          - .log
        exclude_patterns:
          - "**/node_modules/**"
      `;
      const selectedFiles = [
        '/mock/repo/src/index.js',
        '/mock/repo/src/utils/helpers.js',
        '/mock/repo/package.json',
        '/mock/repo/important.log', // Should be processed despite extension due to negation
        '/mock/repo/node_modules/react/index.js', // Should be excluded
      ];

      // Execute
      const handler = mockIpcHandlers['repo:analyze'];
      expect(handler).toBeDefined();

      const result = await handler(null, { rootPath, configContent, selectedFiles });

      // Verify
      expect(result).toBeDefined();
      expect(result.filesInfo).toBeDefined();
      expect(Array.isArray(result.filesInfo)).toBe(true);

      // Should have analyzed files
      expect(result.filesInfo.length).toBeGreaterThan(0);

      // Should have counted tokens correctly
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    test('should handle binary files', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const configContent = '';
      const selectedFiles = [
        '/mock/repo/src/index.js',
        '/mock/repo/image.png', // Binary file
      ];

      // Explicitly set isBinary mock to return true for PNG files
      const mockIsBinary = require('../../../src/utils/file-analyzer').isBinaryFile;
      mockIsBinary.mockImplementation((filePath) => {
        return filePath.endsWith('.png');
      });

      // Execute
      const handler = mockIpcHandlers['repo:analyze'];
      const result = await handler(null, { rootPath, configContent, selectedFiles });

      // Verify
      expect(result).toBeDefined();
      expect(result.filesInfo).toBeDefined();

      // Should include binary file with isBinary flag
      const binaryFile = result.filesInfo.find((f) => f.path === 'image.png');
      expect(binaryFile).toBeDefined();
      expect(binaryFile.isBinary).toBe(true);
      expect(binaryFile.tokens).toBe(0);

      // Should have counted skipped binary files
      expect(result.skippedBinaryFiles).toBe(1);
    });

    test('should validate paths and skip files outside root', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const configContent = '';
      const selectedFiles = [
        '/mock/repo/src/index.js',
        '/another/path/file.js', // Outside root
        '/mock/repo-secrets/config.js', // Prefix collision should be rejected
        '/mock/repo/../repo-secrets/hidden.js', // Traversal should be rejected
      ];

      // Execute
      const handler = mockIpcHandlers['repo:analyze'];
      const result = await handler(null, { rootPath, configContent, selectedFiles });

      // Verify
      expect(result).toBeDefined();
      expect(result.filesInfo).toBeDefined();

      // Should include files within root
      expect(result.filesInfo.find((f) => f.path === 'src/index.js')).toBeDefined();

      // Should have correct number of files (only those inside root)
      expect(result.filesInfo.length).toBe(1);
    });

    test('should allow relative selected files inside root and reject traversal', async () => {
      const rootPath = '/mock/repo';
      const configContent = '';
      const selectedFiles = ['src/index.js', '../repo-secrets/hidden.js'];

      const handler = mockIpcHandlers['repo:analyze'];
      const result = await handler(null, { rootPath, configContent, selectedFiles });

      expect(result.filesInfo.find((f) => f.path === 'src/index.js')).toBeDefined();
      expect(result.filesInfo.length).toBe(1);
    });

    test('should skip suspicious file content when secret scanning is enabled', async () => {
      const rootPath = '/mock/repo';
      const configContent = `
        use_custom_excludes: true
        use_gitignore: true
        include_extensions:
          - .js
        exclude_patterns:
          - "**/node_modules/**"
      `;
      const selectedFiles = ['/mock/repo/src/index.js', '/mock/repo/src/secrets.js'];

      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.endsWith('secrets.js')) {
          return `const token = "${FAKE_GITHUB_TOKEN}";`;
        }
        return 'console.log("Hello world");';
      });

      const handler = mockIpcHandlers['repo:analyze'];
      const result = await handler(null, { rootPath, configContent, selectedFiles });

      expect(result.filesInfo.find((file) => file.path === 'src/index.js')).toBeDefined();
      expect(result.filesInfo.find((file) => file.path === 'src/secrets.js')).toBeUndefined();
    });

    test('should reject analysis for unauthorized root path', async () => {
      const handler = mockIpcHandlers['repo:analyze'];
      await expect(
        handler(null, {
          rootPath: '/etc',
          configContent: '',
          selectedFiles: ['/etc/passwd'],
        })
      ).rejects.toThrow('Unauthorized root path');
    });
  });

  describe('repo:process', () => {
    test('should process files and generate formatted content', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const filesInfo = [
        { path: 'src/index.js', tokens: 100 },
        { path: 'package.json', tokens: 50 },
        { path: 'README.md', tokens: 200 },
      ];
      const options = {
        showTokenCount: true,
        includeTreeView: true,
      };

      // Execute
      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '/ mock-repo\n  ├── src\n  │   └── index.js\n  ├── package.json\n  └── README.md',
        options,
      });

      // Verify
      expect(result).toBeDefined();
      expect(result.exportFormat).toBe('markdown');
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');

      // Should include tree view
      expect(result.content).toContain('## File Structure');
      expect(result.content).toContain('```');
      expect(result.content).toContain('## File Contents');

      // Should include file content sections
      expect(result.content).toContain('src/index.js');
      expect(result.content).toContain('package.json');
    });

    test('should generate tree connectors correctly when treeView is omitted', async () => {
      const rootPath = '/mock/repo';
      const filesInfo = [
        { path: 'A/C.js', tokens: 10 },
        { path: 'B.js', tokens: 5 },
      ];
      const options = {
        includeTreeView: true,
        exportFormat: 'markdown',
      };

      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '',
        options,
      });

      expect(result.content).toContain('## File Structure');
      expect(result.content).toContain('├── A');
      expect(result.content).toContain('│   └── C.js');
      expect(result.content).toContain('└── B.js');
    });

    test('should not include markdown file-contents heading when tree view is disabled', async () => {
      const rootPath = '/mock/repo';
      const filesInfo = [{ path: 'src/index.js', tokens: 100 }];
      const options = {
        showTokenCount: true,
        includeTreeView: false,
      };

      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '',
        options,
      });

      expect(result.exportFormat).toBe('markdown');
      expect(result.content).toContain('# Repository Content');
      expect(result.content).not.toContain('## File Structure');
      expect(result.content).not.toContain('## File Contents');
      expect(result.content).toContain('src/index.js');
    });

    test('should generate xml output when exportFormat is xml', async () => {
      const rootPath = '/mock/repo';
      const filesInfo = [
        { path: 'src/index.js', tokens: 100 },
        { path: 'package.json', tokens: 50 },
      ];
      const options = {
        showTokenCount: true,
        includeTreeView: true,
        exportFormat: 'xml',
      };

      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '/ mock-repo\n  ├── src\n  │   └── index.js\n  └── package.json',
        options,
      });

      expect(result.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result.exportFormat).toBe('xml');
      expect(result.content).toContain('<repositoryContent>');
      expect(result.content).toContain('<fileStructure><![CDATA[');
      expect(result.content).toContain('<files>');
      expect(result.content).toContain('<file path="src/index.js" tokens="100" binary="false">');
      expect(result.content).toContain(
        '<summary totalTokens="150" processedFiles="2" skippedFiles="0" />'
      );
      expect(result.content).toContain('</repositoryContent>');
    });

    test('should include xml token attributes when showTokenCount is not explicitly set', async () => {
      const rootPath = '/mock/repo';
      const filesInfo = [{ path: 'src/index.js', tokens: 100 }];
      const options = {
        includeTreeView: true,
        exportFormat: 'xml',
      };

      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '/ mock-repo\n  └── src\n      └── index.js',
        options,
      });

      expect(result.exportFormat).toBe('xml');
      expect(result.content).toContain('<file path="src/index.js" tokens="100" binary="false">');
    });

    test('should omit xml token attributes when showTokenCount is false', async () => {
      const rootPath = '/mock/repo';
      const filesInfo = [{ path: 'src/index.js', tokens: 100 }];
      const options = {
        showTokenCount: false,
        exportFormat: 'xml',
      };

      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '',
        options,
      });

      expect(result.exportFormat).toBe('xml');
      expect(result.content).toContain('<file path="src/index.js" binary="false">');
      expect(result.content).not.toContain('tokens="100"');
    });

    test('should handle binary files correctly', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const filesInfo = [
        { path: 'src/index.js', tokens: 100 },
        { path: 'image.png', tokens: 0, isBinary: true },
      ];
      const options = {};

      // Execute
      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '',
        options,
      });

      // Verify
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Should format binary files correctly
      expect(result.content).toContain('[BINARY FILE]');
    });

    test('should handle missing files gracefully', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const filesInfo = [
        { path: 'src/index.js', tokens: 100 },
        { path: 'nonexistent/file.js', tokens: 50 }, // This will be skipped
      ];
      const options = {};

      // Mock existsSync to return false for nonexistent files
      fs.existsSync.mockImplementation((path) => {
        return !path.includes('nonexistent');
      });

      // Execute
      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '',
        options,
      });

      // Verify
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      // Should have skipped files count
      expect(result.skippedFiles).toBe(1);
    });

    test('should skip files outside root even with traversal or prefix-collision paths', async () => {
      const rootPath = '/mock/repo';
      const filesInfo = [
        { path: 'src/index.js', tokens: 100 },
        { path: '../repo-secrets/config.js', tokens: 50 },
      ];

      const handler = mockIpcHandlers['repo:process'];
      const result = await handler(null, {
        rootPath,
        filesInfo,
        treeView: '',
        options: {},
      });

      expect(result.processedFiles).toBe(1);
      expect(result.skippedFiles).toBe(1);
      expect(result.content).toContain('src/index.js');
      expect(result.content).not.toContain('../repo-secrets/config.js');
    });

    test('should reject processing for unauthorized root path', async () => {
      const handler = mockIpcHandlers['repo:process'];
      await expect(
        handler(null, {
          rootPath: '/etc',
          filesInfo: [{ path: 'passwd', tokens: 1 }],
          treeView: '',
          options: {},
        })
      ).rejects.toThrow('Unauthorized root path');
    });

    test('should only allow the currently authorized root after re-selection', async () => {
      const { dialog } = require('electron');
      const selectDirectoryHandler = mockIpcHandlers['dialog:selectDirectory'];
      const processHandler = mockIpcHandlers['repo:process'];

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/mock/repo-next'],
      });
      await selectDirectoryHandler(null);

      await expect(
        processHandler(null, {
          rootPath: '/mock/repo-next',
          filesInfo: [],
          treeView: '',
          options: {},
        })
      ).resolves.toEqual(
        expect.objectContaining({
          processedFiles: 0,
          skippedFiles: 0,
        })
      );

      await expect(
        processHandler(null, {
          rootPath: '/mock/repo',
          filesInfo: [],
          treeView: '',
          options: {},
        })
      ).rejects.toThrow('Unauthorized root path');
    });
  });

  describe('fs:saveFile', () => {
    test('should prioritize xml filter when default path uses .xml extension', async () => {
      const { dialog } = require('electron');
      dialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/mock/repo/output.xml',
      });

      const handler = mockIpcHandlers['fs:saveFile'];
      const result = await handler(null, {
        content: '<xml />',
        defaultPath: '/mock/repo/output.xml',
      });

      const saveDialogCallArgs = dialog.showSaveDialog.mock.calls[0];
      const saveDialogOptions = saveDialogCallArgs[saveDialogCallArgs.length - 1];
      expect(saveDialogOptions.filters[0]).toEqual({
        name: 'XML Files',
        extensions: ['xml'],
      });
      expect(result).toBe('/mock/repo/output.xml');
      expect(fs.writeFileSync).toHaveBeenCalledWith('/mock/repo/output.xml', '<xml />');
    });

    test('should prioritize markdown filter when default path uses .md extension', async () => {
      const { dialog } = require('electron');
      dialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/mock/repo/output.md',
      });

      const handler = mockIpcHandlers['fs:saveFile'];
      await handler(null, {
        content: '# output',
        defaultPath: '/mock/repo/output.md',
      });

      const saveDialogCallArgs = dialog.showSaveDialog.mock.calls[0];
      const saveDialogOptions = saveDialogCallArgs[saveDialogCallArgs.length - 1];
      expect(saveDialogOptions.filters[0]).toEqual({
        name: 'Markdown Files',
        extensions: ['md'],
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/mock/repo/output.md', '# output');
    });

    test('should return null when save dialog is canceled', async () => {
      const { dialog } = require('electron');
      dialog.showSaveDialog.mockResolvedValue({
        canceled: true,
        filePath: undefined,
      });

      const handler = mockIpcHandlers['fs:saveFile'];
      const result = await handler(null, {
        content: '# output',
        defaultPath: '/mock/repo/output.md',
      });

      expect(result).toBeNull();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('should handle missing defaultPath safely', async () => {
      const { dialog } = require('electron');
      dialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/mock/repo/output.md',
      });

      const handler = mockIpcHandlers['fs:saveFile'];
      const result = await handler(null, {
        content: '# output',
        defaultPath: undefined,
      });

      const saveDialogCallArgs = dialog.showSaveDialog.mock.calls[0];
      const saveDialogOptions = saveDialogCallArgs[saveDialogCallArgs.length - 1];
      expect(saveDialogOptions.defaultPath).toBe('');
      expect(result).toBe('/mock/repo/output.md');
      expect(fs.writeFileSync).toHaveBeenCalledWith('/mock/repo/output.md', '# output');
    });
  });

  describe('assets:getPath', () => {
    test('should return path for valid assets', async () => {
      const handler = mockIpcHandlers['assets:getPath'];
      const result = await handler(null, 'icon.png');

      expect(typeof result).toBe('string');
      expect(result).toMatch(/assets[\\/]+icon\.png$/);
    });

    test('should reject traversal paths outside assets directory', async () => {
      const handler = mockIpcHandlers['assets:getPath'];
      fs.existsSync.mockClear();

      const result = await handler(null, '../../etc/passwd');

      expect(result).toBeNull();
      expect(fs.existsSync).not.toHaveBeenCalled();
    });
  });

  describe('tokens:countFiles', () => {
    test('should count tokens for multiple files', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const filePaths = [
        '/mock/repo/src/file1.js',
        '/mock/repo/src/file2.js',
        '/mock/repo/package.json',
      ];

      // Execute
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, { rootPath, filePaths });

      // Verify
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      // Should have results for all files
      expect(Object.keys(result.results).length).toBe(3);

      // Should have stats for all files
      expect(Object.keys(result.stats).length).toBe(3);
    });

    test('should handle binary files correctly', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const filePaths = [
        '/mock/repo/src/file.js',
        '/mock/repo/image.png', // binary file
      ];

      // Execute
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, { rootPath, filePaths });

      // Verify
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      // JS file should have tokens, PNG should have 0
      expect(result.results['/mock/repo/src/file.js']).toBe(100);
      expect(result.results['/mock/repo/image.png']).toBe(0);
    });

    test('should handle missing files gracefully', async () => {
      // Setup
      const rootPath = '/mock/repo';
      const filePaths = ['/mock/repo/src/file.js', '/mock/repo/nonexistent/file.js'];

      // Mock to make nonexistent file fail
      fs.existsSync.mockImplementation((path) => {
        return !path.includes('nonexistent');
      });

      // Execute
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, { rootPath, filePaths });

      // Verify
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      // Existing file should have tokens, nonexistent should have 0
      expect(result.results['/mock/repo/src/file.js']).toBe(100);
      expect(result.results['/mock/repo/nonexistent/file.js']).toBe(0);
    });

    test('should skip files outside root path', async () => {
      const rootPath = '/mock/repo';
      const filePaths = ['/mock/repo/src/file.js', '/mock/repo-secrets/secret.js'];

      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, { rootPath, filePaths });

      expect(result.results['/mock/repo/src/file.js']).toBe(100);
      expect(result.results['/mock/repo-secrets/secret.js']).toBe(0);
      expect(result.stats['/mock/repo-secrets/secret.js']).toBeUndefined();
    });

    test('should resolve relative paths against root and reject traversal escapes', async () => {
      const rootPath = '/mock/repo';
      const filePaths = ['src/file.js', '../repo-secrets/secret.js'];

      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, { rootPath, filePaths });

      expect(result.results['src/file.js']).toBe(100);
      expect(result.results['../repo-secrets/secret.js']).toBe(0);
      expect(result.stats['../repo-secrets/secret.js']).toBeUndefined();
    });

    test('should reject token counting for unauthorized root path', async () => {
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, { rootPath: '/etc', filePaths: ['/etc/passwd'] });
      expect(result).toEqual({ results: {}, stats: {} });
    });
  });
});
