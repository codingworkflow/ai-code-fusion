/**
 * Unified pattern matching utility using minimatch for robust glob pattern handling
 */

const minimatch = require('minimatch');

// Common minimatch options
const MINIMATCH_OPTIONS = { 
  matchBase: true,  // Makes *.js match file.js in any directory
  dot: true         // Include dotfiles
};

/**
 * Match a path against a pattern
 * @param {string} path - The path to check
 * @param {string} pattern - The pattern to match against
 * @returns {boolean} - True if path matches the pattern
 */
function matchPattern(path, pattern) {
  try {
    // Direct equality check for exact matches (optimization)
    if (path === pattern) {
      return true;
    }
    
    // Convert directory patterns (ending with /) to globstar patterns
    // This makes 'dist/' effectively the same as 'dist/**'
    if (pattern.endsWith('/')) {
      const dirPattern = pattern.slice(0, -1) + '/**';
      // Use the minimatch compiled matcher for consistency with other code paths
      const matcher = new minimatch.Minimatch(dirPattern, MINIMATCH_OPTIONS);
      return matcher.match(path);
    }
    
    // For all other patterns, use the compiled matcher approach
    // This ensures consistency between matchPattern and matchCompiledPattern
    const matcher = new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS);
    return matcher.match(path);
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
    try {
      // Handle directory patterns consistently
      const actualPattern = pattern.endsWith('/') 
        ? pattern.slice(0, -1) + '/**' 
        : pattern;
      
      // Determine if this is a simple pattern (for optimization)
      const isSimple = !actualPattern.includes('*') && 
                       !actualPattern.includes('?') && 
                       !actualPattern.includes('[') && 
                       !actualPattern.includes(']');
      
      // Create a matcher with the transformed pattern
      const matcher = new minimatch.Minimatch(actualPattern, MINIMATCH_OPTIONS);
      
      return { 
        pattern,        // Original pattern string
        actualPattern,  // Transformed pattern (if needed)
        isSimple,       // Flag for optimization
        matcher         // Compiled minimatch instance
      };
    } catch (error) {
      console.error(`Error compiling pattern ${pattern}:`, error);
      return { 
        pattern, 
        actualPattern: pattern,
        isSimple: false,
        error: true 
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
  // Error case - pattern couldn't be compiled
  if (compiledPattern.error) {
    return false;
  }
  
  // Direct equality optimization for simple patterns
  if (compiledPattern.isSimple && path === compiledPattern.pattern) {
    return true;
  }
  
  // Use the pre-compiled matcher for all other cases
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
  
  // Use the compiled matcher approach for consistency and efficiency
  const compiledPatterns = compilePatterns(patterns);
  return matchAnyCompiledPattern(path, compiledPatterns);
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
