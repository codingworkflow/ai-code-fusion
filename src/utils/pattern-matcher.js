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
    // Simple exact string match first for performance
    if (path === pattern) {
      return true;
    }
    
    // Special handling for directory patterns with trailing slashes
    if (pattern.endsWith('/') && !path.endsWith('/')) {
      // For patterns like 'dist/', treat as 'dist/**' to match contents
      if (path.startsWith(pattern) || path.startsWith(pattern.slice(0, -1) + '/')) {
        return true;
      }
    }
    
    // For all patterns, create a new matcher to ensure consistent behavior
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
    // Check for syntax issues in pattern before considering it simple
    let hasWildcard = pattern.includes('*') || pattern.includes('?') || 
                     pattern.includes('[') || pattern.includes(']');
    let hasTrailingSlash = pattern.endsWith('/');
    let hasInvalidSyntax = false;
    
    try {
      // Try creating a minimatch instance to detect syntax errors
      new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS);
    } catch (error) {
      hasInvalidSyntax = true;
    }
    
    // Simple patterns are valid patterns without wildcards or trailing slashes
    const isSimple = !hasWildcard && !hasTrailingSlash && !hasInvalidSyntax;
    
    // Create a matcher for both simple and complex patterns
    try {
      // Store the dirPattern flag for special handling of trailing slashes
      const isDirectoryPattern = pattern.endsWith('/');
      
      // Create a minimatch instance with our standard options
      const matcher = new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS);
      
      return { 
        pattern,           // Original pattern string
        isSimple,          // Simple pattern flag
        isDirectoryPattern,// Directory pattern flag
        matcher            // Store the matcher instance
      };
    } catch (error) {
      console.error(`Error compiling pattern ${pattern}:`, error);
      // Return a pattern object that won't match anything
      return { 
        pattern, 
        isSimple: false, 
        isDirectoryPattern: false,
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
  // Handle error case
  if (compiledPattern.error) {
    return false;
  }
  
  // Handle simple patterns with exact match first for performance
  if (compiledPattern.isSimple && path === compiledPattern.pattern) {
    return true;
  }
  
  // Special handling for directory patterns
  if (compiledPattern.isDirectoryPattern) {
    const patternWithoutSlash = compiledPattern.pattern.slice(0, -1);
    
    // Check if path is inside the directory
    if (path.startsWith(compiledPattern.pattern) || 
        path.startsWith(patternWithoutSlash + '/')) {
      return true;
    }
  }
  
  // Use the stored minimatch instance
  if (compiledPattern.matcher) {
    return compiledPattern.matcher.match(path);
  }
  
  // Fallback to standard pattern matching
  return matchPattern(path, compiledPattern.pattern);
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
  
  // Use the compiled matcher approach for consistency
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
