const fs = require('fs');
const path = require('path');
const { GitignoreParser } = require('../../src/utils/gitignore-parser');

// Mock fs and path modules
jest.mock('fs');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

describe('GitignoreParser', () => {
  let gitignoreParser;
  const mockRootPath = '/mock/repo';
  const mockGitignorePath = '/mock/repo/.gitignore';

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Create a fresh instance of GitignoreParser for each test
    gitignoreParser = new GitignoreParser();

    // Setup path.join mock to return the correct gitignore path
    path.join.mockImplementation((...args) => {
      if (args.includes('.gitignore')) {
        return mockGitignorePath;
      }
      return args.join('/');
    });
  });

  describe('parseGitignore', () => {
    test('should return empty pattern arrays when no gitignore file exists', () => {
      // Setup fs.existsSync to return false
      fs.existsSync.mockReturnValue(false);

      const result = gitignoreParser.parseGitignore(mockRootPath);

      expect(result).toEqual({
        excludePatterns: [],
        includePatterns: [],
      });
      expect(fs.existsSync).toHaveBeenCalledWith(mockGitignorePath);
    });

    test('should cache and return empty patterns when no gitignore file exists', () => {
      // Setup fs.existsSync to return false
      fs.existsSync.mockReturnValue(false);

      // Call twice to test caching
      gitignoreParser.parseGitignore(mockRootPath);
      const secondCall = gitignoreParser.parseGitignore(mockRootPath);

      expect(secondCall).toEqual({
        excludePatterns: [],
        includePatterns: [],
      });
      // Should only check existence once due to caching
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });

    test('should parse basic patterns from gitignore file', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`
        # Comment line
        node_modules
        *.log
        .DS_Store
      `);

      const result = gitignoreParser.parseGitignore(mockRootPath);

      // Basic patterns should be in the excludePatterns array
      expect(result.excludePatterns).toContain('node_modules');
      expect(result.excludePatterns).toContain('**/node_modules');
      expect(result.excludePatterns).toContain('*.log');
      expect(result.excludePatterns).toContain('**/*.log');
      expect(result.excludePatterns).toContain('.DS_Store');
      expect(result.excludePatterns).toContain('**/.DS_Store');
      expect(result.includePatterns).toEqual([]);
    });

    test('should handle negated patterns correctly', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`
        *.log
        !important.log
        node_modules/
        !node_modules/important-package/
      `);

      const result = gitignoreParser.parseGitignore(mockRootPath);

      // Check exclude patterns
      expect(result.excludePatterns).toContainEqual(expect.stringMatching(/\*\.log/));
      expect(result.excludePatterns).toContainEqual(expect.stringMatching(/node_modules\//));

      // Check include patterns (negated)
      expect(result.includePatterns).toContainEqual(expect.stringMatching(/important\.log/));
      expect(result.includePatterns).toContainEqual(
        expect.stringMatching(/node_modules\/important-package\//)
      );
    });

    test('should handle path-specific patterns correctly', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`
        /specific-root-file.js
        src/specific-file.js
        /specific-dir/
      `);

      const result = gitignoreParser.parseGitignore(mockRootPath);

      // Check exclude patterns
      expect(result.excludePatterns).toContain('specific-root-file.js');
      expect(result.excludePatterns).toContain('src/specific-file.js');
      expect(result.excludePatterns).toContain('**/src/specific-file.js');

      // Check for directory pattern
      const dirPattern = result.excludePatterns.find((p) => p.startsWith('specific-dir/'));
      expect(dirPattern).toBeDefined();
    });

    test('should handle directory patterns correctly', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`
        build/
        dist/
        node_modules/
      `);

      const result = gitignoreParser.parseGitignore(mockRootPath);

      // Check exclude patterns for directories
      expect(result.excludePatterns).toContain('build/');
      expect(result.excludePatterns).toContain('**/build/');
      expect(result.excludePatterns).toContain('dist/');
      expect(result.excludePatterns).toContain('**/dist/');
      expect(result.excludePatterns).toContain('node_modules/');
      expect(result.excludePatterns).toContain('**/node_modules/');
    });

    test('should handle complex patterns with wildcards', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(`
        **/*.min.js
        **/node_modules/**
        src/**/*.test.js
      `);

      const result = gitignoreParser.parseGitignore(mockRootPath);

      // Check exclude patterns
      expect(result.excludePatterns).toContain('**/*.min.js');
      expect(result.excludePatterns).toContain('**/node_modules/**');
      expect(result.excludePatterns).toContain('src/**/*.test.js');
    });

    test('should cache parsed patterns for repeated calls', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('*.log\nnode_modules/');

      // First call
      const firstResult = gitignoreParser.parseGitignore(mockRootPath);

      // Second call should use cache
      const secondResult = gitignoreParser.parseGitignore(mockRootPath);

      // Verify results are the same
      expect(secondResult).toBe(firstResult);

      // fs.readFileSync should only be called once
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });

    test('should handle errors when reading gitignore file', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      // Should not throw but return empty patterns
      const result = gitignoreParser.parseGitignore(mockRootPath);

      expect(result).toEqual({
        excludePatterns: [],
        includePatterns: [],
      });

      // Error should be logged
      // Note: We can't easily test for console.error in Jest without additional mocking
    });
  });

  describe('clearCache', () => {
    test('should clear the cache', () => {
      // Setup fs mocks
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('*.log');

      // First call to populate cache
      gitignoreParser.parseGitignore(mockRootPath);

      // Clear cache
      gitignoreParser.clearCache();

      // Call again - should hit filesystem again
      gitignoreParser.parseGitignore(mockRootPath);

      // fs.readFileSync should be called twice
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      expect(fs.existsSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('_parseGitignoreContent', () => {
    test('should skip empty lines and comments', () => {
      const content = `
        # This is a comment

        # Another comment
        *.log
      `;

      const result = gitignoreParser._parseGitignoreContent(content);

      // Check that we have the expected patterns, ignoring default build artifacts
      const nonBuildPatterns = result.excludePatterns.filter(
        (p) => !p.includes('bundle.js') && !p.includes('index.js.map') && !p.includes('output.css')
      );
      expect(nonBuildPatterns).toHaveLength(2);
      expect(result.excludePatterns).toContain('*.log');
      expect(result.excludePatterns).toContain('**/*.log');
    });

    test('should add default build artifact patterns', () => {
      const content = ''; // Empty content

      const result = gitignoreParser._parseGitignoreContent(content);

      // Should have default build artifact patterns
      expect(result.excludePatterns).toContain('**/bundle.js');
      expect(result.excludePatterns).toContain('**/bundle.js.map');
      expect(result.excludePatterns).toContain('**/bundle.js.LICENSE.txt');
      expect(result.excludePatterns).toContain('**/index.js.map');
      expect(result.excludePatterns).toContain('**/output.css');
    });
  });
});
