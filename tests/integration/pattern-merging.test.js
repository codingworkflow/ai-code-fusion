const path = require('path');
const fs = require('fs');
const { FileAnalyzer } = require('../../src/utils/file-analyzer');
const { GitignoreParser } = require('../../src/utils/gitignore-parser');
const { TokenCounter } = require('../../src/utils/token-counter');

// Mock only external dependencies, not business logic
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  openSync: jest.fn(),
  readSync: jest.fn(),
  closeSync: jest.fn()
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  extname: jest.fn().mockImplementation((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
  }),
}));

jest.mock('../../src/utils/token-counter');

// Helper to create test files
const createTestFiles = () => {
  return [
    // Regular code files
    'src/index.js',
    'src/components/App.jsx',
    'src/utils/helpers.js',

    // Config files
    '.env',
    '.gitignore',
    'package.json',

    // Build artifacts
    'dist/bundle.js',
    'dist/index.html',
    'build/output.css',

    // Binary files
    'images/logo.png',
    'public/favicon.ico',

    // Node modules
    'node_modules/react/index.js',

    // Git directory
    '.git/index',

    // Log files
    'logs/debug.log',
    'logs/important.log',
    'important.log', // Root level important.log (for gitignore negation)

    // Test files
    'src/__tests__/app.test.js',

    // Documentation
    'README.md',
    'docs/guide.md',
    
    // Additional directory for critical logs (gitignore negation)
    'logs/critical/error.js'
  ];
};

describe('Pattern Merging Integration', () => {
  let mockTokenCounter;
  const mockRootPath = '/mock/repo';

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock token counter
    mockTokenCounter = new TokenCounter();
    mockTokenCounter.countTokens = jest.fn().mockReturnValue(100);

    // Mock filesystem operations for gitignore files
    fs.existsSync.mockImplementation(path => {
      if (path.endsWith('.gitignore')) {
        return true;
      }
      return false;
    });
    
    fs.readFileSync.mockImplementation(path => {
      if (path.endsWith('.gitignore')) {
        return `
# Common files to ignore
*.log
logs/
.DS_Store
temp/

# Negated patterns (inclusions)
!important.log
!logs/important.log
!logs/critical/
`;
      }
      throw new Error(`Unexpected file read: ${path}`);
    });
    
    // Setup mock fs functions for binary detection
    fs.openSync.mockReturnValue(123); // Mock file descriptor
    fs.readSync.mockImplementation(() => {
      // Just return some text content by default for this test
      return 10;
    });
  });

  describe('Config with only custom excludes enabled', () => {
    let fileAnalyzer;
    
    beforeEach(() => {
      const config = {
        include_extensions: ['.js', '.jsx', '.json', '.md'],
        exclude_patterns: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/__tests__/**',
          '.env',
        ],
        use_custom_excludes: true,
        use_gitignore: false,
        filter_by_extension: true
      };

      fileAnalyzer = new FileAnalyzer(config, mockTokenCounter);
    });

    test('should only apply custom excludes and ignore gitignore patterns', () => {
      const testFiles = createTestFiles();

      const results = testFiles.map((file) => ({
        file,
        shouldProcess: fileAnalyzer.shouldProcessFile(file),
      }));

      // Files that should be processed
      expect(results.find((r) => r.file === 'src/index.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/components/App.jsx').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/utils/helpers.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'package.json').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'README.md').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'docs/guide.md').shouldProcess).toBe(true);

      // Log files should be processed if they have the right extension
      // But they're .log files which are not in our include_extensions
      expect(results.find((r) => r.file === 'logs/debug.log').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'logs/important.log').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'important.log').shouldProcess).toBe(false);

      // Files that should be excluded by custom excludes
      expect(results.find((r) => r.file === '.env').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'node_modules/react/index.js').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === '.git/index').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'dist/bundle.js').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'build/output.css').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'src/__tests__/app.test.js').shouldProcess).toBe(false);

      // Not in include extensions
      expect(results.find((r) => r.file === 'images/logo.png').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'public/favicon.ico').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'dist/index.html').shouldProcess).toBe(false);
    });
  });

  describe('Config with only gitignore enabled', () => {
    let fileAnalyzer;
    
    beforeEach(() => {
      const config = {
        include_extensions: ['.js', '.jsx', '.json', '.md', '.log'],
        exclude_patterns: [],
        use_custom_excludes: false,
        use_gitignore: true,
        filter_by_extension: true
      };

      // Parse gitignore patterns
      const gitignoreParser = new GitignoreParser();
      const gitignorePatterns = gitignoreParser.parseGitignore(mockRootPath);

      fileAnalyzer = new FileAnalyzer(config, mockTokenCounter, {
        useGitignore: true,
        gitignorePatterns
      });
    });

    test('should only apply gitignore patterns', () => {
      const testFiles = createTestFiles();

      const results = testFiles.map((file) => ({
        file,
        shouldProcess: fileAnalyzer.shouldProcessFile(file),
      }));

      // Files that should be processed
      expect(results.find((r) => r.file === 'src/index.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/components/App.jsx').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/utils/helpers.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'package.json').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'README.md').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'docs/guide.md').shouldProcess).toBe(true);

      // Node modules files should be processed (custom excludes disabled)
      expect(results.find((r) => r.file === 'node_modules/react/index.js').shouldProcess).toBe(true);

      // Test files should be processed (custom excludes disabled)
      expect(results.find((r) => r.file === 'src/__tests__/app.test.js').shouldProcess).toBe(true);

      // Config files should be processed if they have the right extension
      expect(results.find((r) => r.file === '.env').shouldProcess).toBe(false); // Not in include extensions

      // Log files should be affected by gitignore
      expect(results.find((r) => r.file === 'logs/debug.log').shouldProcess).toBe(false); // Excluded by gitignore

      // important.log should be included due to gitignore negation (it's in the include patterns)
      expect(results.find((r) => r.file === 'logs/important.log').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'important.log').shouldProcess).toBe(true);
      
      // logs/critical/* should be included due to gitignore negation
      expect(results.find((r) => r.file === 'logs/critical/error.js').shouldProcess).toBe(true);

      // Not in include extensions
      expect(results.find((r) => r.file === 'images/logo.png').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'public/favicon.ico').shouldProcess).toBe(false);
    });
  });

  describe('Config with both custom excludes and gitignore enabled', () => {
    let fileAnalyzer;
    
    beforeEach(() => {
      const config = {
        include_extensions: ['.js', '.jsx', '.json', '.md', '.log'],
        exclude_patterns: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          'important.log', // Conflicts with gitignore include
        ],
        use_custom_excludes: true,
        use_gitignore: true,
        filter_by_extension: true
      };

      // Parse gitignore patterns
      const gitignoreParser = new GitignoreParser();
      const gitignorePatterns = gitignoreParser.parseGitignore(mockRootPath);

      fileAnalyzer = new FileAnalyzer(config, mockTokenCounter, {
        useGitignore: true,
        gitignorePatterns
      });
    });

    test('should apply both patterns with custom excludes taking precedence', () => {
      const testFiles = createTestFiles();

      const results = testFiles.map((file) => ({
        file,
        shouldProcess: fileAnalyzer.shouldProcessFile(file),
      }));

      // Files that should be processed
      expect(results.find((r) => r.file === 'src/index.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/components/App.jsx').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/utils/helpers.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'package.json').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'README.md').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'docs/guide.md').shouldProcess).toBe(true);

      // Files excluded by custom excludes
      expect(results.find((r) => r.file === 'node_modules/react/index.js').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === '.git/index').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'dist/bundle.js').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'build/output.css').shouldProcess).toBe(false);

      // Files excluded by gitignore
      expect(results.find((r) => r.file === 'logs/debug.log').shouldProcess).toBe(false);

      // Important.log should be excluded by custom excludes despite gitignore negation
      expect(results.find((r) => r.file === 'important.log').shouldProcess).toBe(false);
      
      // logs/important.log is not specifically in custom excludes, so comes from gitignore negation
      expect(results.find((r) => r.file === 'logs/important.log').shouldProcess).toBe(true);

      // logs/critical/* should be included due to gitignore negation
      expect(results.find((r) => r.file === 'logs/critical/error.js').shouldProcess).toBe(true);

      // Not in include extensions
      expect(results.find((r) => r.file === 'images/logo.png').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'public/favicon.ico').shouldProcess).toBe(false);
    });
  });

  describe('Config with neither custom excludes nor gitignore enabled', () => {
    let fileAnalyzer;
    
    beforeEach(() => {
      const config = {
        include_extensions: ['.js', '.jsx', '.json', '.md', '.log'],
        exclude_patterns: [],
        use_custom_excludes: false,
        use_gitignore: false,
        filter_by_extension: true
      };

      fileAnalyzer = new FileAnalyzer(config, mockTokenCounter);
    });

    test('should only filter based on extensions', () => {
      const testFiles = createTestFiles();

      const results = testFiles.map((file) => ({
        file,
        shouldProcess: fileAnalyzer.shouldProcessFile(file),
      }));

      // All files with matching extensions should be processed
      expect(results.find((r) => r.file === 'src/index.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/components/App.jsx').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/utils/helpers.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'package.json').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'README.md').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'docs/guide.md').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'node_modules/react/index.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'src/__tests__/app.test.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'logs/debug.log').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'logs/important.log').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'important.log').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'dist/bundle.js').shouldProcess).toBe(true);
      expect(results.find((r) => r.file === 'logs/critical/error.js').shouldProcess).toBe(true);

      // Files with non-matching extensions should be excluded
      expect(results.find((r) => r.file === '.env').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'images/logo.png').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'public/favicon.ico').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'build/output.css').shouldProcess).toBe(false);
      expect(results.find((r) => r.file === 'dist/index.html').shouldProcess).toBe(false);
    });
  });
});
