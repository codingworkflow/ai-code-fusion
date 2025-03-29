const fs = require('fs');
const path = require('path');
const { compilePatterns } = require('./pattern-matcher');

/**
 * A utility class for parsing and applying gitignore rules.
 */
class GitignoreParser {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Clear the gitignore patterns cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Parse a .gitignore file and return patterns organized by type.
   * @param {string} rootPath - The root path of the repository
   * @returns {Object} - Object with include and exclude patterns
   */
  parseGitignore(rootPath) {
    // Check if we have a cached result for this root path
    if (this.cache.has(rootPath)) {
      return this.cache.get(rootPath);
    }

    const gitignorePath = path.join(rootPath, '.gitignore');

    // Default result with empty pattern arrays
    const defaultResult = {
      excludePatterns: [],
      includePatterns: [],
      compiledExcludePatterns: [],
      compiledIncludePatterns: []
    };

    // Check if .gitignore exists
    if (!fs.existsSync(gitignorePath)) {
      // No gitignore file, cache default result
      this.cache.set(rootPath, defaultResult);
      return defaultResult;
    }

    try {
      // Read and parse .gitignore file
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const patterns = this._parseGitignoreContent(content);

      // Cache the parsed patterns
      this.cache.set(rootPath, patterns);
      return patterns;
    } catch (error) {
      console.error('Error parsing .gitignore:', error);
      // Cache default result on error
      this.cache.set(rootPath, defaultResult);
      return defaultResult;
    }
  }

  /**
   * Parse gitignore content and extract valid patterns
   * @param {string} content - The content of the .gitignore file
   * @returns {Object} - Object with include and exclude patterns
   */
  _parseGitignoreContent(content) {
    const result = {
      excludePatterns: [],
      includePatterns: [], // For negated patterns
    };

    // Split by line and process each line
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Handle negated patterns (patterns starting with !)
      const isNegated = trimmedLine.startsWith('!');

      // Convert gitignore pattern to glob pattern
      let pattern = isNegated ? trimmedLine.substring(1).trim() : trimmedLine;

      // Skip pattern if still empty after trimming
      if (!pattern) {
        continue;
      }

      // Special handling for direct file paths in gitignore
      if (pattern.includes('/')) {
        // Pattern refers to a specific path

        // Handle patterns appropriately based on prefix
        if (pattern.startsWith('/')) {
          // Pattern with leading / is relative to repo root (remove the leading /)
          pattern = pattern.substring(1);

          // Create more specific patterns for files like /src/renderer/bundle.js
          if (!pattern.includes('*')) {
            // If it's a path without wildcards, we need to make it more specific
            if (pattern.endsWith('/')) {
              // Directory pattern - include everything in it
              const dirWithoutSlash = pattern.slice(0, -1);
              
              // Create multiple patterns to ensure directory contents are matched
              const dirPattern = pattern;
              const dirWithStarPattern = `${pattern}**`;
              const dirContentsPattern = `${dirWithoutSlash}/**`;
              
              // Add the patterns
              if (isNegated) {
                result.includePatterns.push(dirPattern);
                result.includePatterns.push(dirWithStarPattern);
                result.includePatterns.push(dirContentsPattern);
              } else {
                result.excludePatterns.push(dirPattern);
                result.excludePatterns.push(dirWithStarPattern);
                result.excludePatterns.push(dirContentsPattern);
              }
              
              continue;
            } else {
              // File pattern - exact match
              const exactPattern = pattern;

              // Add to the appropriate array
              if (isNegated) {
                result.includePatterns.push(exactPattern);
              } else {
                result.excludePatterns.push(exactPattern);
              }

              continue;
            }
          }
        } else {
          // Pattern without leading / matches anywhere in the tree
          // For patterns like src/renderer/bundle.js

          // For direct file paths, we need to create multiple patterns
          if (!pattern.includes('*')) {
            // Check if this is a directory pattern
            if (pattern.endsWith('/')) {
              // Directory pattern
              const rootPattern = pattern;
              const subdirPattern = `**/${pattern}`;
              
              // Remove trailing slash for more patterns
              const dirWithoutSlash = pattern.slice(0, -1);
              const dirContentsPattern = `${dirWithoutSlash}/**`;
              const anyDirContentsPattern = `**/${dirWithoutSlash}/**`;
              
              // Add to the appropriate arrays
              if (isNegated) {
                result.includePatterns.push(rootPattern);
                result.includePatterns.push(subdirPattern);
                result.includePatterns.push(dirContentsPattern);
                result.includePatterns.push(anyDirContentsPattern);
              } else {
                result.excludePatterns.push(rootPattern);
                result.excludePatterns.push(subdirPattern);
                result.excludePatterns.push(dirContentsPattern);
                result.excludePatterns.push(anyDirContentsPattern);
              }
            } else {
              // Regular file pattern
              const rootPattern = pattern;
              const subdirPattern = `**/${pattern}`;
  
              // Add to the appropriate arrays
              if (isNegated) {
                result.includePatterns.push(rootPattern);
                result.includePatterns.push(subdirPattern);
              } else {
                result.excludePatterns.push(rootPattern);
                result.excludePatterns.push(subdirPattern);
              }
            }

            continue;
          }
        }
      } else {
        // Simple pattern like *.log or node_modules

        // Check if it's a directory pattern (ends with /)
        if (pattern.endsWith('/')) {
          // Remove trailing slash for the main pattern that will match directory contents
          const dirWithoutSlash = pattern.slice(0, -1);
          
          // This pattern will match all files inside the directory
          const dirContentPattern = `${dirWithoutSlash}/**`;  // logs/**
          
          // Add to appropriate arrays
          if (isNegated) {
            result.includePatterns.push(dirContentPattern);
          } else {
            result.excludePatterns.push(dirContentPattern);
          }

          continue;
        }

        // It's a simple file pattern like *.log
        // Match both at root and in subdirectories
        const rootPattern = pattern;
        const subdirPattern = `**/${pattern}`;

        // Add to the appropriate arrays
        if (isNegated) {
          result.includePatterns.push(rootPattern);
          result.includePatterns.push(subdirPattern);
        } else {
          result.excludePatterns.push(rootPattern);
          result.excludePatterns.push(subdirPattern);
        }

        continue;
      }

      // Add to the appropriate array
      if (isNegated) {
        result.includePatterns.push(pattern);
      } else {
        result.excludePatterns.push(pattern);
      }
    }

    // Add specific patterns for common build artifacts that might not be caught
    result.excludePatterns.push('**/bundle.js');
    result.excludePatterns.push('**/bundle.js.map');
    result.excludePatterns.push('**/bundle.js.LICENSE.txt');
    result.excludePatterns.push('**/index.js.map');
    result.excludePatterns.push('**/output.css');

    // Pre-compile patterns for better performance
    result.compiledExcludePatterns = compilePatterns(result.excludePatterns);
    result.compiledIncludePatterns = compilePatterns(result.includePatterns);

    return result;
  }
}

module.exports = { GitignoreParser };
