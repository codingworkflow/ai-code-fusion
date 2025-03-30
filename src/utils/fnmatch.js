/**
 * fnmatch compatibility layer using minimatch
 * This is the centralized pattern matching utility for the application
 */

// Import minimatch properly
const Minimatch = require('minimatch').Minimatch;

const fnmatch = {
  /**
   * Match a filepath against a pattern using minimatch
   * @param {string} filepath - The path to check
   * @param {string} pattern - The pattern to match against
   * @returns {boolean} - Whether the path matches the pattern
   */
  fnmatch: (filepath, pattern) => {
    try {
      // Consistent options for all pattern matching throughout the app
      const mm = new Minimatch(pattern, { 
        dot: true,        // Match dotfiles
        matchBase: true,  // Match basename if pattern has no slashes
        nocomment: true,  // Disable comments in patterns
        nobrace: false,   // Enable brace expansion
        noext: false      // Enable extglob features
      });
      return mm.match(filepath);
    } catch (error) {
      console.error(`Error matching pattern ${pattern} against ${filepath}:`, error);
      // We never use FALLBACK, return the error
      return false;
    }
  }
};

module.exports = fnmatch;
