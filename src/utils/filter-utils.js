const path = require('path');
const fnmatch = require('./fnmatch');

/**
 * Utility functions for consistently handling file filtering across the application
 */

/**
 * Normalize path by converting backslashes to forward slashes
 * @param {string} inputPath - The path to normalize
 * @returns {string} - Normalized path
 */
const normalizePath = (inputPath) => {
  return inputPath.replace(/\\/g, '/');
};

/**
 * Get a path relative to a root directory with consistent normalization
 * @param {string} filePath - The absolute file path
 * @param {string} rootPath - The root directory path
 * @returns {string} - Normalized relative path
 */
const getRelativePath = (filePath, rootPath) => {
  const relativePath = path.relative(rootPath, filePath);
  return normalizePath(relativePath);
};

/**
 * Check if a file should be excluded based on patterns and configuration
 * This is the shared implementation used by both main process and file analyzer
 * @param {string} itemPath - The file path to check
 * @param {string} rootPath - The root directory path
 * @param {Array} excludePatterns - Patterns to exclude
 * @param {Object} config - Configuration object
 * @returns {boolean} - True if the file should be excluded
 */
const shouldExclude = (itemPath, rootPath, excludePatterns, config) => {
  try {
    const itemName = path.basename(itemPath);
    const normalizedPath = getRelativePath(itemPath, rootPath);

    // Check if we should filter by file extension
    if (
      config &&
      config.use_custom_includes &&
      config.include_extensions &&
      Array.isArray(config.include_extensions) &&
      path.extname(itemPath)
    ) {
      const ext = path.extname(itemPath).toLowerCase();
      // If we have include extensions defined and this file's extension isn't in the list
      if (!config.include_extensions.includes(ext)) {
        return true; // Exclude because extension is not in the include list
      }
    }

    // First check if path is in include patterns (negated gitignore patterns)
    // includePatterns take highest priority
    if (
      excludePatterns &&
      excludePatterns.includePatterns &&
      Array.isArray(excludePatterns.includePatterns) &&
      excludePatterns.includePatterns.length > 0
    ) {
      for (const pattern of excludePatterns.includePatterns) {
        // Check both the full path and just the filename for simple patterns
        if (
          fnmatch.fnmatch(normalizedPath, pattern) ||
          (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
        ) {
          // This path explicitly matches an include pattern, so don't exclude it
          return false;
        }
      }
    }

    // Then check exclude patterns
    if (Array.isArray(excludePatterns)) {
      for (const pattern of excludePatterns) {
        // Check both the full path and just the filename for simple patterns
        if (
          fnmatch.fnmatch(normalizedPath, pattern) ||
          (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
        ) {
          return true; // Exclude this item
        }
      }
    }

    return false;
  } catch (error) {
    console.error(`Error in shouldExclude for ${itemPath}:`, error);
    return false; // Default to including if there's an error
  }
};

module.exports = {
  normalizePath,
  getRelativePath,
  shouldExclude,
};
