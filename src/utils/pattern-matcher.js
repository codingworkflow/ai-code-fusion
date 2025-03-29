/**
 * Unified pattern matching utility to be used consistently across the application
 */

/**
 * Match a path against a pattern
 * @param {string} path - The path to check
 * @param {string} pattern - The pattern to match against
 * @returns {boolean} - True if path matches the pattern
 */
function matchPattern(path, pattern) {
  try {
    // For simple patterns without wildcards
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return path === pattern || path.endsWith(`/${pattern}`);
    }
    
    // For patterns with wildcards
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    return new RegExp(`^${regexPattern}$`).test(path);
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
    if (!pattern.includes('*') && !pattern.includes('?')) {
      // For simple patterns, store the original
      return { original: pattern, isSimple: true };
    }
    
    // For patterns with wildcards, compile regex
    try {
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      
      return { 
        original: pattern, 
        isSimple: false,
        regex: new RegExp(`^${regexPattern}$`)
      };
    } catch (error) {
      console.error(`Error compiling pattern ${pattern}:`, error);
      // Return a pattern that will never match if compilation fails
      return { original: pattern, isSimple: false, regex: /a^/ };
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
  return compiledPattern.regex.test(path);
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
