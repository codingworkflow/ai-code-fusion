const {
  matchPattern,
  compilePatterns,
  matchCompiledPattern,
  matchAnyPattern,
  matchAnyCompiledPattern
} = require('../../src/utils/pattern-matcher');

describe('Pattern Matcher Utility', () => {
  describe('matchPattern', () => {
    // Simple patterns without wildcards
    test('should match exact paths with simple patterns', () => {
      expect(matchPattern('file.js', 'file.js')).toBe(true);
      expect(matchPattern('dir/file.js', 'dir/file.js')).toBe(true);
      expect(matchPattern('file.js', 'other.js')).toBe(false);
      expect(matchPattern('dir/file.js', 'dir/other.js')).toBe(false);
    });

    test('should handle path variants with simple patterns', () => {
      // Testing with trailing pattern - matches both with and without slashes
      expect(matchPattern('file.js', 'file.js')).toBe(true);
      expect(matchPattern('dir/file.js', 'file.js')).toBe(true);
      expect(matchPattern('path/to/file.js', 'file.js')).toBe(true);
    });

    // Patterns with * wildcards
    test('should match patterns with single * wildcard', () => {
      expect(matchPattern('file.js', '*.js')).toBe(true);
      expect(matchPattern('other.js', '*.js')).toBe(true);
      expect(matchPattern('file.jsx', '*.js')).toBe(false);
      expect(matchPattern('dir/file.js', '*.js')).toBe(true); // With minimatch and matchBase: true
    });

    // Patterns with ** wildcards
    test('should match patterns with ** wildcard', () => {
      expect(matchPattern('dir/file.js', '**/file.js')).toBe(true);
      expect(matchPattern('path/to/file.js', '**/file.js')).toBe(true);
      expect(matchPattern('file.js', '**/file.js')).toBe(true);
      expect(matchPattern('dir/other.js', '**/file.js')).toBe(false);
    });

    // Mixed patterns with multiple wildcards
    test('should match complex patterns with multiple wildcards', () => {
      expect(matchPattern('dir/subdir/file.js', '**/*.js')).toBe(true);
      expect(matchPattern('file.js', '**/*.js')).toBe(true);
      expect(matchPattern('dir/file.jsx', '**/*.js*')).toBe(true);
      expect(matchPattern('dir/file.css', '**/*.js')).toBe(false);
    });

    // Error handling
    test('should handle errors gracefully', () => {
      // Test with invalid regex pattern
      expect(matchPattern('file.js', '[')).toBe(false); // Invalid regex should not throw
    });
  });

  describe('compilePatterns', () => {
    test('should compile simple patterns', () => {
      const patterns = ['file.js', 'dir/file.js'];
      const compiled = compilePatterns(patterns);
      
      expect(compiled).toHaveLength(2);
      expect(compiled[0].original).toBe('file.js');
      expect(compiled[0].isSimple).toBe(true);
      expect(compiled[1].original).toBe('dir/file.js');
      expect(compiled[1].isSimple).toBe(true);
    });

    test('should compile wildcard patterns', () => {
      const patterns = ['*.js', '**/file.js', 'dir/**/*.js'];
      const compiled = compilePatterns(patterns);
      
      expect(compiled).toHaveLength(3);
      expect(compiled[0].original).toBe('*.js');
      expect(compiled[0].isSimple).toBe(false);
      expect(compiled[0].matcher).toBeDefined();
      
      expect(compiled[1].original).toBe('**/file.js');
      expect(compiled[1].isSimple).toBe(false);
      expect(compiled[1].matcher).toBeDefined();
      
      expect(compiled[2].original).toBe('dir/**/*.js');
      expect(compiled[2].isSimple).toBe(false);
      expect(compiled[2].matcher).toBeDefined();
    });

    test('should handle empty or null input', () => {
      expect(compilePatterns([])).toEqual([]);
      expect(compilePatterns(null)).toEqual([]);
      expect(compilePatterns(undefined)).toEqual([]);
    });

    test('should handle invalid patterns', () => {
      // This tests the error handling in the compilePatterns function
      const patterns = ['[', 'valid.js'];
      const compiled = compilePatterns(patterns);
      
      // Should still compile the valid pattern
      expect(compiled).toHaveLength(2);
      expect(compiled[1].original).toBe('valid.js');
      expect(compiled[1].isSimple).toBe(true);
      
      // The invalid pattern should have a matcher that never matches
      expect(compiled[0].original).toBe('[');
      expect(compiled[0].isSimple).toBe(false); // Even invalid patterns are treated as non-simple
      expect(compiled[0].matcher).toBeDefined();
    });
  });

  describe('matchCompiledPattern', () => {
    test('should match against compiled simple patterns', () => {
      const patterns = compilePatterns(['file.js', 'dir/file.js']);
      
      expect(matchCompiledPattern('file.js', patterns[0])).toBe(true);
      expect(matchCompiledPattern('other.js', patterns[0])).toBe(false);
      expect(matchCompiledPattern('dir/file.js', patterns[1])).toBe(true);
    });

    test('should match against compiled wildcard patterns', () => {
      const patterns = compilePatterns(['*.js', '**/file.js', 'dir/**/*.js']);
      
      expect(matchCompiledPattern('file.js', patterns[0])).toBe(true);
      expect(matchCompiledPattern('dir/file.js', patterns[0])).toBe(true); // Minimatch matchBase
      
      expect(matchCompiledPattern('file.js', patterns[1])).toBe(true);
      expect(matchCompiledPattern('dir/file.js', patterns[1])).toBe(true);
      expect(matchCompiledPattern('path/to/file.js', patterns[1])).toBe(true);
      
      expect(matchCompiledPattern('dir/subdir/file.js', patterns[2])).toBe(true);
      expect(matchCompiledPattern('dir/file.js', patterns[2])).toBe(true);
      expect(matchCompiledPattern('other/file.js', patterns[2])).toBe(false);
    });

    test('should handle paths containing pattern delimiter characters', () => {
      const patterns = compilePatterns(['special-[chars].js', 'file.js+']);
      
      expect(matchCompiledPattern('special-[chars].js', patterns[0])).toBe(true);
      expect(matchCompiledPattern('file.js+', patterns[1])).toBe(true);
    });
  });

  describe('matchAnyPattern', () => {
    test('should match if any pattern matches', () => {
      const patterns = ['*.js', '*.jsx', '*.ts'];
      
      expect(matchAnyPattern('file.js', patterns)).toBe(true);
      expect(matchAnyPattern('component.jsx', patterns)).toBe(true);
      expect(matchAnyPattern('utility.ts', patterns)).toBe(true);
      expect(matchAnyPattern('styles.css', patterns)).toBe(false);
    });

    test('should handle empty pattern array', () => {
      expect(matchAnyPattern('file.js', [])).toBe(false);
      expect(matchAnyPattern('file.js', null)).toBe(false);
      expect(matchAnyPattern('file.js', undefined)).toBe(false);
    });
  });

  describe('matchAnyCompiledPattern', () => {
    test('should match if any compiled pattern matches', () => {
      const compiledPatterns = compilePatterns(['*.js', '*.jsx', '*.ts']);
      
      expect(matchAnyCompiledPattern('file.js', compiledPatterns)).toBe(true);
      expect(matchAnyCompiledPattern('component.jsx', compiledPatterns)).toBe(true);
      expect(matchAnyCompiledPattern('utility.ts', compiledPatterns)).toBe(true);
      expect(matchAnyCompiledPattern('styles.css', compiledPatterns)).toBe(false);
    });

    test('should handle empty compiled pattern array', () => {
      expect(matchAnyCompiledPattern('file.js', [])).toBe(false);
      expect(matchAnyCompiledPattern('file.js', null)).toBe(false);
      expect(matchAnyCompiledPattern('file.js', undefined)).toBe(false);
    });

    test('should work with a mix of simple and complex patterns', () => {
      const compiledPatterns = compilePatterns(['file.js', '*.jsx', '**/other.js']);
      
      expect(matchAnyCompiledPattern('file.js', compiledPatterns)).toBe(true);
      expect(matchAnyCompiledPattern('component.jsx', compiledPatterns)).toBe(true);
      expect(matchAnyCompiledPattern('dir/other.js', compiledPatterns)).toBe(true);
      expect(matchAnyCompiledPattern('styles.css', compiledPatterns)).toBe(false);
    });
  });

  // Additional test cases for edge cases and real-world patterns
  describe('Edge cases and real-world patterns', () => {
    test('should handle node_modules pattern correctly', () => {
      // This is a critical pattern for our application
      const nodeModulesPattern = '**/node_modules/**';
      
      expect(matchPattern('node_modules/package/index.js', nodeModulesPattern)).toBe(true);
      expect(matchPattern('src/node_modules/package/index.js', nodeModulesPattern)).toBe(true);
      expect(matchPattern('src/components/index.js', nodeModulesPattern)).toBe(false);
    });

    test('should handle .git pattern correctly', () => {
      const gitPattern = '**/.git/**';
      
      expect(matchPattern('.git/index', gitPattern)).toBe(true);
      expect(matchPattern('project/.git/objects/01/abcdef', gitPattern)).toBe(true);
      expect(matchPattern('src/components/git-icon.svg', gitPattern)).toBe(false);
    });

    test('should handle negated gitignore patterns correctly', () => {
      // In our application, negated patterns are handled separately, but let's test the matching
      const excludePattern = '*.log';
      const includePattern = 'important.log';
      
      expect(matchPattern('debug.log', excludePattern)).toBe(true);
      expect(matchPattern('important.log', excludePattern)).toBe(true); // Would be excluded
      expect(matchPattern('important.log', includePattern)).toBe(true); // Would be included
    });

    test('should handle path variants with trailing slashes', () => {
      // Directory patterns often end with a slash
      const dirPattern = '**/build/';
      const compiledPattern = compilePatterns([dirPattern])[0];
      
      expect(matchPattern('build/', dirPattern)).toBe(true);
      expect(matchPattern('project/build/', dirPattern)).toBe(true);
      expect(matchCompiledPattern('build/', compiledPattern)).toBe(true);
      expect(matchCompiledPattern('project/build/', compiledPattern)).toBe(true);
    });

    test('should handle common gitignore patterns', () => {
      const patterns = [
        'dist/',
        'node_modules/',
        '*.log',
        '!important.log',
        '/specific-file.js'
      ];
      
      // Non-compiled matching
      expect(matchPattern('dist/bundle.js', patterns[0])).toBe(true);
      expect(matchPattern('node_modules/package/index.js', patterns[1])).toBe(true);
      expect(matchPattern('debug.log', patterns[2])).toBe(true);
      expect(matchPattern('specific-file.js', patterns[4])).toBe(true);
      
      // Compiled matching
      const compiledPatterns = compilePatterns(patterns);
      expect(matchCompiledPattern('dist/bundle.js', compiledPatterns[0])).toBe(true);
      expect(matchCompiledPattern('node_modules/package/index.js', compiledPatterns[1])).toBe(true);
      expect(matchCompiledPattern('debug.log', compiledPatterns[2])).toBe(true);
      expect(matchCompiledPattern('specific-file.js', compiledPatterns[4])).toBe(true);
    });
  });
});
