const fs = require('fs');
const path = require('path');
const { TokenCounter } = require('../../src/utils/token-counter');
const { FileAnalyzer } = require('../../src/utils/file-analyzer');
const { GitignoreParser } = require('../../src/utils/gitignore-parser');

// Mock fs operations, not business logic
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  openSync: jest.fn(),
  readSync: jest.fn(),
  closeSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn()
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
  extname: jest.fn().mockImplementation((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
  })
}));

// Mock TokenCounter
jest.mock('../../src/utils/token-counter');

describe('FileAnalyzer', () => {
  let fileAnalyzer;
  let mockTokenCounter;
  let mockConfig;
  let gitignoreParser;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock token counter
    mockTokenCounter = new TokenCounter();
    mockTokenCounter.countTokens = jest.fn().mockReturnValue(100);

    // Create a basic mock config
    mockConfig = {
      include_extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.md'],
      exclude_patterns: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.min.js',
        '.env'
      ],
      use_custom_excludes: true,
      use_gitignore: false,
      filter_by_extension: true
    };

    // Set up GitignoreParser with mocked fs operations
    gitignoreParser = new GitignoreParser();
    
    // Mock fs operations for gitignore file
    fs.existsSync.mockImplementation(path => {
      if (path.endsWith('.gitignore')) {
        return true;
      }
      return false;
    });
    
    fs.readFileSync.mockImplementation((path, options) => {
      if (path.endsWith('.gitignore')) {
        return `
# Common files to ignore
*.log
.DS_Store
coverage/
temp/

# Negated patterns (inclusions)
!important.log
!logs/critical/
`;
      }

      // For text file reads during analyzeFile
      if (path === 'file.js') {
        return 'file content';
      }

      throw new Error(`Unexpected file read: ${path}`);
    });

    // Setup fs.openSync, fs.readSync, and fs.closeSync mocks for binary detection
    fs.openSync.mockImplementation(filePath => {
      // Return a unique fd with a prefix indicating the file type for better tracking
      if (filePath.endsWith('.png') || filePath.endsWith('.ico')) {
        return `binary:${filePath}`;
      }
      return `text:${filePath}`;
    });
    
    fs.readSync.mockImplementation((fd, buffer) => {
      const fdStr = String(fd);
      
      // Binary files
      if (fdStr.startsWith('binary:')) {
        // Simulate a NULL byte in a binary file
        buffer[0] = 0;
        return 100; // Bytes read
      }
      
      // Text files
      const textContent = Buffer.from('var x = 10; // text content');
      textContent.copy(buffer);
      return textContent.length;
    });
    
    // Mock closeSync to do nothing
    fs.closeSync.mockImplementation(() => {});

    // Create FileAnalyzer instance
    fileAnalyzer = new FileAnalyzer(mockConfig, mockTokenCounter);
  });

  describe('shouldProcessFile', () => {
    test('should exclude files that match custom exclude patterns', () => {
      // Create a debugging helper function
      const debugPath = (path) => {
        const result = fileAnalyzer.shouldProcessFile(path);
        if (result !== false) {
          console.log(`UNEXPECTED: ${path} was allowed but should be excluded`);
        }
        return result;
      };
      
      // Node modules files
      expect(debugPath('src/node_modules/package/index.js')).toBe(false);

      // Git files
      expect(debugPath('.git/index')).toBe(false);

      // Dist files
      expect(debugPath('dist/bundle.js')).toBe(false);

      // Build files
      expect(debugPath('build/output.js')).toBe(false);

      // Minified files
      expect(debugPath('public/lib.min.js')).toBe(false);

      // Root-level config files
      expect(debugPath('.env')).toBe(false);
    });

    test('should include files that match include extensions', () => {
      // JavaScript files
      expect(fileAnalyzer.shouldProcessFile('src/app.js')).toBe(true);

      // JSX files
      expect(fileAnalyzer.shouldProcessFile('src/components/Header.jsx')).toBe(true);

      // TypeScript files
      expect(fileAnalyzer.shouldProcessFile('src/utils/helper.ts')).toBe(true);

      // JSON files
      expect(fileAnalyzer.shouldProcessFile('config.json')).toBe(true);

      // Markdown files
      expect(fileAnalyzer.shouldProcessFile('README.md')).toBe(true);
    });

    test('should exclude files with extensions not in include list', () => {
      // CSS file (not in include list)
      expect(fileAnalyzer.shouldProcessFile('src/styles.css')).toBe(false);

      // HTML file (not in include list)
      expect(fileAnalyzer.shouldProcessFile('public/index.html')).toBe(false);

      // Image file (not in include list)
      expect(fileAnalyzer.shouldProcessFile('assets/logo.png')).toBe(false);
    });

    test('should respect custom excludes setting', () => {
      // Create a new instance with custom excludes disabled
      const customFileAnalyzer = new FileAnalyzer(
        {
          ...mockConfig,
          use_custom_excludes: false,
          include_extensions: ['.js'],
          filter_by_extension: true
        },
        mockTokenCounter
      );

      // Now node_modules files should be processed since custom excludes are disabled
      // But still respects the extension filtering
      expect(customFileAnalyzer.shouldProcessFile('src/node_modules/package/index.js')).toBe(true);
      expect(customFileAnalyzer.shouldProcessFile('src/node_modules/package/styles.css')).toBe(false);
    });

    test('should apply gitignore excludes when enabled', () => {
      // Parse the gitignore file
      const gitignorePatterns = gitignoreParser.parseGitignore('/mock/root');
      
      // Create a new instance with gitignore enabled
      const gitignoreEnabled = new FileAnalyzer(
        mockConfig,
        mockTokenCounter,
        {
          useGitignore: true,
          gitignorePatterns
        }
      );

      // Files that should be excluded by gitignore patterns
      expect(gitignoreEnabled.shouldProcessFile('.DS_Store')).toBe(false);
      expect(gitignoreEnabled.shouldProcessFile('debug.log')).toBe(false);
      expect(gitignoreEnabled.shouldProcessFile('coverage/lcov.info')).toBe(false);
      expect(gitignoreEnabled.shouldProcessFile('src/coverage/report.js')).toBe(false);
      expect(gitignoreEnabled.shouldProcessFile('temp/cache.js')).toBe(false);

      // Files that should still be processed
      expect(gitignoreEnabled.shouldProcessFile('src/app.js')).toBe(true);
    });

    test('should respect gitignore include patterns (negated patterns)', () => {
      // Parse the gitignore file
      const gitignorePatterns = gitignoreParser.parseGitignore('/mock/root');
      
      // Create file analyzer with gitignore includes and excludes
      const gitignoreWithIncludes = new FileAnalyzer(
        {
          ...mockConfig,
          include_extensions: ['.js', '.log'],
          filter_by_extension: true
        },
        mockTokenCounter,
        {
          useGitignore: true,
          gitignorePatterns
        }
      );

      // Files that match include patterns (negated gitignore patterns)
      // These should be included even though they match exclude patterns
      expect(gitignoreWithIncludes.shouldProcessFile('important.log')).toBe(true);
      expect(gitignoreWithIncludes.shouldProcessFile('logs/critical/error.js')).toBe(true);

      // Files that match exclude patterns but not include patterns
      expect(gitignoreWithIncludes.shouldProcessFile('debug.log')).toBe(false);
      expect(gitignoreWithIncludes.shouldProcessFile('logs/debug.js')).toBe(false);
    });

    test('should prioritize custom excludes over gitignore patterns', () => {
      // Parse the gitignore file
      const gitignorePatterns = gitignoreParser.parseGitignore('/mock/root');
      
      // Create file analyzer with both custom excludes and gitignore
      const customAndGitignore = new FileAnalyzer(
        {
          ...mockConfig,
          exclude_patterns: [
            '**/node_modules/**',
            'important.log',  // This is in gitignore's include patterns
          ],
          use_custom_excludes: true
        },
        mockTokenCounter,
        {
          useGitignore: true,
          gitignorePatterns
        }
      );

      // important.log should be excluded by custom excludes despite being in gitignore includes
      expect(customAndGitignore.shouldProcessFile('important.log')).toBe(false);
    });
  });

  describe('analyzeFile', () => {
    test('should return null for binary files', () => {
      // Binary file (NULL byte)
      fs.openSync.mockReturnValueOnce(999); // Mock file descriptor
      fs.readSync.mockImplementationOnce((fd, buffer) => {
        buffer[0] = 0; // NULL byte
        return 100; // Bytes read
      });

      const result = fileAnalyzer.analyzeFile('image.png');

      expect(result).toBeNull();
      expect(fs.openSync).toHaveBeenCalledWith('image.png', 'r');
    });

    test('should count tokens for text files', () => {
      // Text file content
      fs.openSync.mockReturnValueOnce(888); // Mock file descriptor
      fs.readSync.mockImplementationOnce((fd, buffer) => {
        Buffer.from('console.log("hello");').copy(buffer);
        return 20; // Bytes read
      });
      
      fs.readFileSync.mockReturnValueOnce('console.log("hello");');

      const result = fileAnalyzer.analyzeFile('file.js');

      expect(result).toBe(100); // From mockTokenCounter
      expect(fs.readFileSync).toHaveBeenCalledWith('file.js', { encoding: 'utf-8', flag: 'r' });
      expect(mockTokenCounter.countTokens).toHaveBeenCalledWith('console.log("hello");');
    });

    test('should handle errors when reading files', () => {
      // Simulate error reading file
      fs.openSync.mockReturnValueOnce(777); // Mock file descriptor
      fs.readSync.mockImplementationOnce(() => {
        throw new Error('Cannot read file');
      });

      const result = fileAnalyzer.analyzeFile('error.js');

      expect(result).toBeNull();
    });
  });

  describe('shouldReadFile', () => {
    test('should return false for binary files', () => {
      // Setup binary file detection
      fs.openSync.mockReturnValueOnce(666); // Mock file descriptor
      fs.readSync.mockImplementationOnce((fd, buffer) => {
        buffer[0] = 0; // NULL byte
        return 10; // Bytes read
      });

      expect(fileAnalyzer.shouldReadFile('image.png')).toBe(false);
      expect(fs.openSync).toHaveBeenCalledWith('image.png', 'r');
    });

    test('should return true for text files', () => {
      // Setup text file detection
      fs.openSync.mockReturnValueOnce(555); // Mock file descriptor
      fs.readSync.mockImplementationOnce((fd, buffer) => {
        Buffer.from('var x = 10;').copy(buffer);
        return 10; // Bytes read
      });

      expect(fileAnalyzer.shouldReadFile('file.js')).toBe(true);
      expect(fs.openSync).toHaveBeenCalledWith('file.js', 'r');
    });
  });
});
