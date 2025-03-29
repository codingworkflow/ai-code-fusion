/**
 * Utility functions for path operations
 */

/**
 * Normalize a path to use forward slashes consistently
 * @param {string} inputPath - The path to normalize
 * @returns {string} - The normalized path
 */
function normalizePath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Get a path relative to a root path and normalize it
 * @param {string} filePath - The full path
 * @param {string} rootPath - The root path
 * @returns {string} - The normalized relative path
 */
function getRelativePath(filePath, rootPath) {
  const path = require('path');
  const relativePath = path.relative(rootPath, filePath);
  return normalizePath(relativePath);
}

/**
 * Check if a path is within a root path
 * @param {string} filePath - The path to check
 * @param {string} rootPath - The root path
 * @returns {boolean} - True if the path is within the root path
 */
function isWithinRoot(filePath, rootPath) {
  if (!filePath || !rootPath) return false;
  return normalizePath(filePath).startsWith(normalizePath(rootPath));
}

module.exports = {
  normalizePath,
  getRelativePath,
  isWithinRoot
};
