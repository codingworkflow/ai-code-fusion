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
    // For simple patterns without wildcards, also check with trailing slash
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return path === pattern || path.endsWith(`/${pattern}`);
    }
    
    // Use minimatch for all wildcard patterns
    return minimatch(path, pattern, MINIMATCH_OPTIONS);
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
    const isSimple = !pattern.includes('*') && !pattern.includes('?');
    
    if (isSimple) {
      // For simple patterns, just store the original
      return { pattern, isSimple: true };
    }
    
    // For wildcard patterns, use minimatch.makeRe to pre-compile
    try {
      // Create a minimatch instance with our standard options
      const matcher = new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS);
      
      // Get the pre-compiled regex
      const regex = matcher.makeRe();
      
      return { 
        pattern,           // Original pattern string
        isSimple: false,   // Not a simple pattern
        regex              // Pre-compiled regex for faster matching
      };
    } catch (error) {
      console.error(`Error compiling pattern ${pattern}:`, error);
      // Return a pattern object that won't match anything
      return { 
        pattern, 
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
  // Handle error case
  if (compiledPattern.error) {
    return false;
  }
  
  // Handle simple patterns
  if (compiledPattern.isSimple) {
    return path === compiledPattern.pattern || 
           path.endsWith(`/${compiledPattern.pattern}`);
  }
  
  // Use the pre-compiled regex for efficient matching
  if (compiledPattern.regex) {
    return compiledPattern.regex.test(path);
  }
  
  // Fallback to standard minimatch if regex isn't available for some reason
  return minimatch(path, compiledPattern.pattern, MINIMATCH_OPTIONS);
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
