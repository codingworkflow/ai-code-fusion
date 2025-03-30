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
 * Check if a file should be excluded by extension
 * @param {string} itemPath - File path to check
 * @param {Object} config - Configuration object
 * @returns {boolean} - True if file should be excluded by extension
 */
const shouldExcludeByExtension = (itemPath, config) => {
  if (
    config?.use_custom_includes &&
    config?.include_extensions &&
    Array.isArray(config.include_extensions) &&
    path.extname(itemPath)
  ) {
    const ext = path.extname(itemPath).toLowerCase();
    // If extension is not in the include list, exclude it
    return !config.include_extensions.includes(ext);
  }
  return false;
};

/**
 * Check if a file matches include patterns
 * @param {string} normalizedPath - Normalized file path
 * @param {string} itemName - File name
 * @param {Array} includePatterns - Include patterns to check
 * @returns {boolean} - True if file matches any include pattern
 */
const matchesIncludePatterns = (normalizedPath, itemName, includePatterns) => {
  if (Array.isArray(includePatterns) && includePatterns.length > 0) {
    for (const pattern of includePatterns) {
      // Check both the full path and just the filename for simple patterns
      if (
        fnmatch.fnmatch(normalizedPath, pattern) ||
        (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
      ) {
        // Matches an include pattern
        return true;
      }
    }
  }
  return false;
};

/**
 * Check if a file matches exclude patterns
 * @param {string} normalizedPath - Normalized file path
 * @param {string} itemName - File name
 * @param {Array} excludePatterns - Exclude patterns to check
 * @returns {boolean} - True if file matches any exclude pattern
 */
const matchesExcludePatterns = (normalizedPath, itemName, excludePatterns) => 
  Array.isArray(excludePatterns) && excludePatterns.length > 0 && excludePatterns.some(
    (pattern) =>
      fnmatch.fnmatch(normalizedPath, pattern) ||
      (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
  );

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

    // Check extension exclusion first
    if (shouldExcludeByExtension(itemPath, config)) {
      return true;
    }

    // Check include patterns (negated gitignore) - these take priority
    if (matchesIncludePatterns(normalizedPath, itemName, excludePatterns?.includePatterns)) {
      return false;
    }

    // Check exclude patterns
    if (matchesExcludePatterns(normalizedPath, itemName, excludePatterns)) {
      return true;
    }

    // Default: not excluded
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
