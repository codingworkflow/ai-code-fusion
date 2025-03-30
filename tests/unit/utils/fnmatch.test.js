const { fnmatch } = require('../../../src/utils/fnmatch');

describe('fnmatch', () => {
  // Basic pattern tests
  describe('basic patterns', () => {
    test('exact matches', () => {
      expect(fnmatch('file.txt', 'file.txt')).toBe(true);
      expect(fnmatch('file.txt', 'other.txt')).toBe(false);
      expect(fnmatch('path/to/file.txt', 'path/to/file.txt')).toBe(true);
    });
    
    test('wildcard patterns', () => {
      expect(fnmatch('file.txt', '*.txt')).toBe(true);
      expect(fnmatch('file.js', '*.txt')).toBe(false);
      expect(fnmatch('path/file.txt', '*/file.txt')).toBe(true);
      expect(fnmatch('path/to/file.txt', '*/file.txt')).toBe(false);
    });
    
    test('multiple wildcards', () => {
      expect(fnmatch('path/to/file.txt', '*/*/*.txt')).toBe(true);
      expect(fnmatch('path/file.txt', '*/*/*.txt')).toBe(false);
      expect(fnmatch('path/to/file.jpg', '*/*/*.txt')).toBe(false);
    });
  });
  
  // Path-specific features
  describe('path patterns', () => {
    test('matchBase mode for basename matching', () => {
      // matchBase should match basename if pattern has no slashes
      expect(fnmatch('path/to/file.txt', 'file.txt')).toBe(true);
      expect(fnmatch('deeply/nested/path/file.txt', 'file.txt')).toBe(true);
      
      // Should still require exact extension match
      expect(fnmatch('path/to/file.js', 'file.txt')).toBe(false);
    });
    
    test('root-anchored patterns', () => {
      expect(fnmatch('file.txt', '/file.txt')).toBe(false); // Pattern is absolute, path is relative
      expect(fnmatch('/file.txt', '/file.txt')).toBe(true);
      expect(fnmatch('/path/file.txt', '/path/*')).toBe(true);
    });
    
    test('directory matches with trailing slash', () => {
      expect(fnmatch('node_modules/', 'node_modules/')).toBe(true);
      expect(fnmatch('node_modules', 'node_modules/')).toBe(false); // Path needs trailing slash
      expect(fnmatch('src/node_modules/', '*/node_modules/')).toBe(true);
    });
  });
  
  // Glob features
  describe('glob patterns', () => {
    test('double-star patterns for recursive matching', () => {
      expect(fnmatch('path/to/file.txt', '**/file.txt')).toBe(true);
      expect(fnmatch('file.txt', '**/file.txt')).toBe(true);
      expect(fnmatch('a/very/deep/path/file.txt', '**/file.txt')).toBe(true);
      
      expect(fnmatch('path/to/other.txt', '**/file.txt')).toBe(false);
    });
    
    test('character classes', () => {
      expect(fnmatch('file.txt', 'file.[tj]xt')).toBe(true);
      expect(fnmatch('file.jxt', 'file.[tj]xt')).toBe(true);
      expect(fnmatch('file.sxt', 'file.[tj]xt')).toBe(false);
      
      expect(fnmatch('file1.txt', 'file[0-9].txt')).toBe(true);
      expect(fnmatch('fileA.txt', 'file[0-9].txt')).toBe(false);
    });
    
    test('negated character classes', () => {
      expect(fnmatch('file1.txt', 'file[!a-z].txt')).toBe(true);
      expect(fnmatch('filea.txt', 'file[!a-z].txt')).toBe(false);
    });
    
    test('brace expansion', () => {
      expect(fnmatch('file.js', '*.{js,jsx}')).toBe(true);
      expect(fnmatch('file.jsx', '*.{js,jsx}')).toBe(true);
      expect(fnmatch('file.ts', '*.{js,jsx}')).toBe(false);
      
      expect(fnmatch('src/components', '{src,app}/components')).toBe(true);
      expect(fnmatch('app/components', '{src,app}/components')).toBe(true);
      expect(fnmatch('lib/components', '{src,app}/components')).toBe(false);
    });
    
    test('complex patterns', () => {
      expect(fnmatch('src/components/Button.jsx', 'src/**/*.{js,jsx}')).toBe(true);
      expect(fnmatch('src/utils/helpers.js', 'src/**/*.{js,jsx}')).toBe(true);
      expect(fnmatch('src/components/Button.css', 'src/**/*.{js,jsx}')).toBe(false);
      
      expect(fnmatch('test/unit/Button.test.js', 'test/**/*.test.{js,jsx}')).toBe(true);
      expect(fnmatch('test/integration/api.spec.js', 'test/**/*.test.{js,jsx}')).toBe(false);
    });
    
    test('dot files', () => {
      // With dot:true option, should match dot files
      expect(fnmatch('.gitignore', '*')).toBe(true);
      expect(fnmatch('.env', '*')).toBe(true);
      expect(fnmatch('path/.config', '*/.config')).toBe(true);
    });
  });
  
  // Error handling
  describe('error handling', () => {
    test('invalid patterns', () => {
      // Minimatch should throw an error on invalid pattern, but our fnmatch wrapper should handle it
      expect(fnmatch('file.txt', '[invalid-pattern')).toBe(false);
    });
    
    test('non-string inputs', () => {
      expect(fnmatch(null, '*.txt')).toBe(false);
      expect(fnmatch('file.txt', null)).toBe(false);
      expect(fnmatch({}, '*.txt')).toBe(false);
    });
  });
});
