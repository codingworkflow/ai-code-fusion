const fs = require('fs');
const yaml = require('yaml');
const FAKE_GITHUB_TOKEN = ['ghp', 'AAAAAAAAAAAAAAAAAAAAAAAA'].join('_');

// Mock electron ipcMain
const mockIpcHandlers = {};
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
    registerFileProtocol: jest.fn(),
  },
}));

jest.mock('fs');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  normalize: jest.fn().mockImplementation((p) => p),
  relative: jest.fn().mockImplementation((from, to) => {
    // Simple implementation for testing
    if (to.startsWith(from)) {
      return to.substring(from.length).replace(/^\//, '');
    }
    return to;
  }),
  extname: jest.fn().mockImplementation((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }),
  basename: jest.fn().mockImplementation((filePath) => {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  }),
}));

jest.mock('yaml');

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
    processFile: jest.fn().mockImplementation((filePath, relativePath) => {
      if (filePath.includes('binary') || filePath.endsWith('.png') || filePath.endsWith('.ico')) {
        return `${relativePath} (binary file)\n[BINARY FILE]\n`;
      }
      return `${relativePath}\n\`\`\`\nMocked content\n\`\`\`\n`;
    }),
  })),
}));

// Import the main process AFTER setting up all mocks
require('../../../src/main/index');

describe('Main Process IPC Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();

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

    fs.statSync.mockImplementation((itemPath) => {
      const isDirectory =
        itemPath.endsWith('src') ||
        itemPath.endsWith('utils') ||
        itemPath.endsWith('node_modules') ||
        itemPath.endsWith('react');

      return {
        isDirectory: () => isDirectory,
        size: 1000,
        mtime: new Date(),
      };
    });

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
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');

      // Should include tree view
      expect(result.content).toContain('## File Structure');
      expect(result.content).toContain('```');

      // Should include file content sections
      expect(result.content).toContain('src/index.js');
      expect(result.content).toContain('package.json');
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
  });

  describe('tokens:countFiles', () => {
    test('should count tokens for multiple files', async () => {
      // Setup
      const filePaths = [
        '/mock/repo/src/file1.js',
        '/mock/repo/src/file2.js',
        '/mock/repo/package.json',
      ];

      // Execute
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, filePaths);

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
      const filePaths = [
        '/mock/repo/src/file.js',
        '/mock/repo/image.png', // binary file
      ];

      // Execute
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, filePaths);

      // Verify
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      // JS file should have tokens, PNG should have 0
      expect(result.results['/mock/repo/src/file.js']).toBe(100);
      expect(result.results['/mock/repo/image.png']).toBe(0);
    });

    test('should handle missing files gracefully', async () => {
      // Setup
      const filePaths = ['/mock/repo/src/file.js', '/mock/repo/nonexistent/file.js'];

      // Mock to make nonexistent file fail
      fs.existsSync.mockImplementation((path) => {
        return !path.includes('nonexistent');
      });

      // Execute
      const handler = mockIpcHandlers['tokens:countFiles'];
      const result = await handler(null, filePaths);

      // Verify
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();

      // Existing file should have tokens, nonexistent should have 0
      expect(result.results['/mock/repo/src/file.js']).toBe(100);
      expect(result.results['/mock/repo/nonexistent/file.js']).toBe(0);
    });
  });
});
