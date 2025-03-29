/**
 * Unified pattern matching utility using minimatch for robust glob pattern handling
 */

const minimatch = require('minimatch');

/**
 * Match a path against a pattern
 * @param {string} path - The path to check
 * @param {string} pattern - The pattern to match against
 * @returns {boolean} - True if path matches the pattern
 */
function matchPattern(path, pattern) {
  try {
    // For simple patterns without wildcards, also check with trailing slash
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return path === pattern || path.endsWith(`/${pattern}`);
    }
    
    // Use minimatch for all wildcard patterns (handles **, *, ? correctly)
    return minimatch(path, pattern, { 
      matchBase: true, // Match basename of path if pattern has no slashes
      dot: true,       // Include dotfiles in matches
      nocase: false    // Case-sensitive matching
    });
  } catch (error) {
    console.error(`Error matching pattern ${pattern} against ${path}:`, error);
    return false;
  }
}

/**
 * Pre-compile patterns for more efficient matching
 * @param {string[]} patterns - Array of patterns to compile
 * @returns {array} - Array of compiled pattern objects
 */
function compilePatterns(patterns) {
  if (!patterns || !Array.isArray(patterns)) {
    return [];
  }
  
  return patterns.map(pattern => {
    // Determine if it's a simple pattern (no wildcards)
    const isSimple = !pattern.includes('*') && !pattern.includes('?');
    
    if (isSimple) {
      // For simple patterns, just store the original
      return { original: pattern, isSimple: true };
    }
    
    // For wildcard patterns, use minimatch
    try {
      // Create minimatch instance for this pattern
      const matcher = new minimatch.Minimatch(pattern, {
        matchBase: true,
        dot: true,
        nocase: false
      });
      
      return { 
        original: pattern, 
        isSimple: false,
        matcher: matcher
      };
    } catch (error) {
      console.error(`Error compiling pattern ${pattern}:`, error);
      // Return a pattern that will never match if compilation fails
      return { 
        original: pattern, 
        isSimple: false, 
        matcher: { match: () => false } 
      };
    }
  });
}

/**
 * Match a path against a pre-compiled pattern
 * @param {string} path - The path to check
 * @param {object} compiledPattern - The pre-compiled pattern object
 * @returns {boolean} - True if path matches the pattern
 */
function matchCompiledPattern(path, compiledPattern) {
  if (compiledPattern.isSimple) {
    return path === compiledPattern.original || 
           path.endsWith(`/${compiledPattern.original}`);
  }
  
  // Use the minimatch matcher for wildcard patterns
  return compiledPattern.matcher.match(path);
}

/**
 * Match a path against an array of patterns
 * @param {string} path - The path to check
 * @param {string[]} patterns - Array of patterns to match against
 * @returns {boolean} - True if path matches any pattern
 */
function matchAnyPattern(path, patterns) {
  if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
    return false;
  }
  
  return patterns.some(pattern => matchPattern(path, pattern));
}

/**
 * Match a path against an array of pre-compiled patterns
 * @param {string} path - The path to check
 * @param {array} compiledPatterns - Array of pre-compiled pattern objects
 * @returns {boolean} - True if path matches any pattern
 */
function matchAnyCompiledPattern(path, compiledPatterns) {
  if (!compiledPatterns || !Array.isArray(compiledPatterns) || compiledPatterns.length === 0) {
    return false;
  }
  
  return compiledPatterns.some(compiledPattern => 
    matchCompiledPattern(path, compiledPattern)
  );
}

module.exports = { 
  matchPattern, 
  compilePatterns,
  matchCompiledPattern,
  matchAnyPattern,
  matchAnyCompiledPattern
};
