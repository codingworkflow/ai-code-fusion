const fs = require('fs');
const path = require('path');

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

  // Helper methods for _parseGitignoreContent
  _addPattern(result, pattern, isNegated) {
    if (!pattern) return;
    if (isNegated) {
      result.includePatterns.push(pattern);
    } else {
      result.excludePatterns.push(pattern);
    }
  }

  _processSimplePattern(result, pattern, isNegated) {
    // Simple pattern like *.log or node_modules
    const isDir = pattern.endsWith('/');
    const rootPattern = pattern;
    const subdirPattern = `**/${pattern}`;

    this._addPattern(result, rootPattern, isNegated);
    this._addPattern(result, subdirPattern, isNegated);

    if (isDir) {
      this._addPattern(result, `${pattern}**`, isNegated);
    }
  }

  _processPathPattern(result, pattern, isNegated) {
    if (pattern.startsWith('/')) {
      // Remove leading slash
      pattern = pattern.substring(1);

      if (pattern.endsWith('/')) {
        pattern = `${pattern}**`;
      }

      this._addPattern(result, pattern, isNegated);
    } else if (!pattern.includes('*')) {
      // Pattern without leading slash and without wildcards
      const rootPattern = pattern;
      const subdirPattern = `**/${pattern}`;

      this._addPattern(result, rootPattern, isNegated);
      this._addPattern(result, subdirPattern, isNegated);
    } else {
      // Pattern with wildcards and path separators, but not starting with /
      this._addPattern(result, pattern, isNegated);
      
      // Also add the recursive version for patterns with path separators
      if (pattern.includes('/')) {
        this._addPattern(result, `**/${pattern}`, isNegated);
      }
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
      includePatterns: [],
    };

    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;

      // Handle negated patterns
      const isNegated = trimmedLine.startsWith('!');
      let pattern = isNegated ? trimmedLine.substring(1).trim() : trimmedLine;

      // Skip if pattern is empty after processing
      if (!pattern) continue;

      // Process pattern based on whether it includes a path separator
      if (pattern.includes('/')) {
        this._processPathPattern(result, pattern, isNegated);
      } else {
        this._processSimplePattern(result, pattern, isNegated);
      }
    }

    // Add common build artifacts
    const buildArtifacts = [
      '**/bundle.js',
      '**/bundle.js.map',
      '**/bundle.js.LICENSE.txt',
      '**/index.js.map',
      '**/output.css',
    ];

    for (const artifact of buildArtifacts) {
      result.excludePatterns.push(artifact);
    }

    return result;
  }
}

module.exports = { GitignoreParser };
