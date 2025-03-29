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
    
    // Handle gitignore directory patterns (ending with /)
    // When a pattern ends with /, it should match all contents in that directory
    if (pattern.endsWith('/')) {
      // Create a pattern that properly handles directory contents
      const dirContents = pattern.slice(0, -1) + '/**';
      try {
        return minimatch(path, dirContents, MINIMATCH_OPTIONS);
      } catch (dirError) {
        console.error(`Error matching directory pattern ${dirContents} against ${path}:`, dirError);
      }
    }
    
    // Handle patterns with leading slash (anchored to root)
    if (pattern.startsWith('/') && !path.startsWith('/')) {
      // Strip the leading slash for matching, similar to gitignore-parser's behavior
      try {
        return minimatch(path, pattern.substring(1), MINIMATCH_OPTIONS);
      } catch (slashError) {
        console.error(`Error matching root pattern ${pattern} against ${path}:`, slashError);
      }
    }
    
    // Use minimatch for all patterns
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
    // Check for syntax issues in pattern before considering it simple
    let hasWildcard = pattern.includes('*') || pattern.includes('?') || 
                     pattern.includes('[') || pattern.includes(']');
    let hasInvalidSyntax = false;
    
    try {
      // Try creating a minimatch instance to detect syntax errors
      new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS);
    } catch (error) {
      hasInvalidSyntax = true;
    }
    
    // Simple patterns are valid patterns without wildcards
    const isSimple = !hasWildcard && !hasInvalidSyntax;
    
    if (isSimple) {
      return { 
        pattern,
        isSimple: true,
        // Store the minimatch instance for simple patterns too
        matcher: new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS)
      };
    }
    
    // For wildcard patterns, use minimatch.Minimatch to pre-compile
    try {
      // Create a minimatch instance with our standard options
      const matcher = new minimatch.Minimatch(pattern, MINIMATCH_OPTIONS);
      
      return { 
        pattern,           // Original pattern string
        isSimple: false,   // Not a simple pattern
        matcher            // Store the matcher instance
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
  
  // Handle simple patterns with exact match first for performance
  if (compiledPattern.isSimple && path === compiledPattern.pattern) {
    return true;
  }
  
  const pattern = compiledPattern.pattern;
  
  // Handle directory patterns (ending with /)
  if (pattern.endsWith('/')) {
    // Create a pattern that properly handles directory contents
    const dirContents = pattern.slice(0, -1) + '/**';
    try {
      return minimatch(path, dirContents, MINIMATCH_OPTIONS);
    } catch (dirError) {
      console.error(`Error matching directory pattern ${dirContents} against ${path}:`, dirError);
    }
  }
  
  // Handle patterns with leading slash (anchored to root)
  if (pattern.startsWith('/') && !path.startsWith('/')) {
    // Strip the leading slash for matching
    try {
      return minimatch(path, pattern.substring(1), MINIMATCH_OPTIONS);
    } catch (slashError) {
      console.error(`Error matching root pattern ${pattern} against ${path}:`, slashError);
    }
  }
  
  // Use the stored minimatch instance if available
  if (compiledPattern.matcher) {
    return compiledPattern.matcher.match(path);
  }
  
  // Fallback to standard minimatch if matcher isn't available
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
  
  // Loop through patterns manually to avoid unnecessary pattern compilations
  for (const pattern of patterns) {
    if (matchPattern(path, pattern)) {
      return true;
    }
  }
  
  return false;
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
  
  // Loop through patterns manually for better error handling and debugging
  for (const compiledPattern of compiledPatterns) {
    if (matchCompiledPattern(path, compiledPattern)) {
      return true;
    }
  }
  
  return false;
}

module.exports = { 
  matchPattern, 
  compilePatterns,
  matchCompiledPattern,
  matchAnyPattern,
  matchAnyCompiledPattern
};
