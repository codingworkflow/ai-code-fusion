const path = require('path');
const { 
  normalizePath, 
  getRelativePath, 
  shouldExclude 
} = require('../../../src/utils/filter-utils');
const fnmatch = require('../../../src/utils/fnmatch');

// Mock path module
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  relative: jest.fn().mockImplementation((from, to) => {
    // Simple implementation for testing
    if (to.startsWith(from)) {
      return to.substring(from.length).replace(/^\//, '');
    }
    return to;
  })
}));

describe('filter-utils', () => {
  
  describe('normalizePath', () => {
    test('should convert backslashes to forward slashes', () => {
      expect(normalizePath('C:\\path\\to\\file.js')).toBe('C:/path/to/file.js');
    });

    test('should keep forward slashes unchanged', () => {
      expect(normalizePath('/path/to/file.js')).toBe('/path/to/file.js');
    });

    test('should handle mixed slashes', () => {
      expect(normalizePath('/path\\to/file\\name.js')).toBe('/path/to/file/name.js');
    });

    test('should handle empty paths', () => {
      expect(normalizePath('')).toBe('');
    });
  });

  describe('getRelativePath', () => {
    test('should get path relative to root', () => {
      path.relative.mockImplementationOnce((from, to) => 'src/file.js');
      const result = getRelativePath('/root/src/file.js', '/root');
      expect(result).toBe('src/file.js');
      expect(path.relative).toHaveBeenCalledWith('/root', '/root/src/file.js');
    });

    test('should normalize the result', () => {
      path.relative.mockImplementationOnce((from, to) => 'src\\file.js');
      const result = getRelativePath('/root/src/file.js', '/root');
      expect(result).toBe('src/file.js');
    });
  });

  describe('shouldExclude', () => {
    // Test cases for different combinations of config settings

    test('should exclude files that match exclude patterns when use_custom_excludes is true', () => {
      const itemPath = '/project/node_modules/package.json';
      const rootPath = '/project';
      const excludePatterns = ['**/node_modules/**'];
      const config = { use_custom_excludes: true };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(true);
    });

    test('should not exclude files that match exclude patterns when use_custom_excludes is false', () => {
      const itemPath = '/project/node_modules/package.json';
      const rootPath = '/project';
      // Empty array for gitignore patterns - this parameter represents gitignore patterns, not custom excludes
      const gitignorePatterns = [];
      const config = { 
        use_custom_excludes: false,
        // Put the exclude pattern in the config object where it belongs
        exclude_patterns: ['**/node_modules/**']
      };

      expect(shouldExclude(itemPath, rootPath, gitignorePatterns, config)).toBe(false);
    });

    test('should exclude files without matching extension when use_custom_includes is true', () => {
      const itemPath = '/project/src/file.css';
      const rootPath = '/project';
      const excludePatterns = [];
      const config = { 
        use_custom_includes: true,
        include_extensions: ['.js', '.jsx']
      };

      // Mock implementation to ensure correct behavior for this test
      jest.spyOn(path, 'extname').mockImplementationOnce((file) => '.css');

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(true);
      
      // Reset the mock
      path.extname.mockRestore();
    });

    test('should exclude files with non-matching extensions when use_custom_includes is true', () => {
      const itemPath = '/project/src/file.css';
      const rootPath = '/project';
      const excludePatterns = [];
      const config = { 
        use_custom_includes: true,
        include_extensions: ['.js', '.jsx', '.json']
      };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(true);
    });

    test('should include files with matching extensions when use_custom_includes is true', () => {
      const itemPath = '/project/src/file.js';
      const rootPath = '/project';
      const excludePatterns = [];
      const config = { 
        use_custom_includes: true,
        include_extensions: ['.js', '.jsx', '.json']
      };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(false);
    });

    test('should exclude files that match gitignore patterns when use_gitignore is true', () => {
      const itemPath = '/project/logs/error.log';
      const rootPath = '/project';
      const excludePatterns = ['*.log'];
      const config = { 
        use_custom_excludes: false,
        use_gitignore: true
      };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(true);
    });

    test('should not exclude files that match gitignore patterns when use_gitignore is false', () => {
      const itemPath = '/project/logs/error.log';
      const rootPath = '/project';
      const excludePatterns = ['*.log'];
      const config = { 
        use_custom_excludes: false,
        use_gitignore: false
      };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(false);
    });

    test('should handle precedence of custom excludes over gitignore includes', () => {
      const itemPath = '/project/logs/important.log';
      const rootPath = '/project';
      // This represents the negated pattern !important.log in gitignore
      const excludePatterns = {
        excludePatterns: ['*.log'],
        includePatterns: ['important.log']
      };
      const config = { 
        use_custom_excludes: true,
        use_gitignore: true,
        exclude_patterns: ['important.log'] // explicitly exclude in custom patterns
      };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(true);
    });

    test('should honor gitignore negated patterns when not explicitly excluded', () => {
      const itemPath = '/project/logs/important.log';
      const rootPath = '/project';
      // This represents the negated pattern !important.log in gitignore
      const excludePatterns = {
        excludePatterns: ['*.log'],
        includePatterns: ['important.log']
      };
      const config = { 
        use_custom_excludes: true,
        use_gitignore: true,
        exclude_patterns: ['*.html'] // No explicit exclude for important.log
      };

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(false);
    });

    test('should handle empty patterns', () => {
      const itemPath = '/project/src/file.js';
      const rootPath = '/project';
      const excludePatterns = [];
      const config = {};

      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(false);
    });

    test('should handle error cases gracefully', () => {
      const itemPath = null;
      const rootPath = '/project';
      const excludePatterns = ['*.log'];
      const config = { 
        use_custom_excludes: true
      };

      // Should not throw an error
      expect(() => shouldExclude(itemPath, rootPath, excludePatterns, config)).not.toThrow();
      // Default to not excluding in error case
      expect(shouldExclude(itemPath, rootPath, excludePatterns, config)).toBe(false);
    });
  });
});
