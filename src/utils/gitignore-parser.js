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
   * Parse a .gitignore file and return an array of patterns.
   * @param {string} rootPath - The root path of the repository
   * @returns {string[]} - Array of patterns from gitignore
   */
  parseGitignore(rootPath) {
    // Check if we have a cached result for this root path
    if (this.cache.has(rootPath)) {
      return this.cache.get(rootPath);
    }

    const gitignorePath = path.join(rootPath, '.gitignore');
    
    // Check if .gitignore exists
    if (!fs.existsSync(gitignorePath)) {
      // No gitignore file, cache an empty array
      this.cache.set(rootPath, []);
      return [];
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
      // Cache an empty array on error
      this.cache.set(rootPath, []);
      return [];
    }
  }

  /**
   * Parse gitignore content and extract valid patterns
   * @param {string} content - The content of the .gitignore file
   * @returns {string[]} - Array of processed patterns
   */
  _parseGitignoreContent(content) {
    const patterns = [];
    
    // Split by line and process each line
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }
      
      // Handle negated patterns (for now we're not supporting them)
      if (trimmedLine.startsWith('!')) {
        continue;
      }
      
      // Convert gitignore pattern to glob pattern
      let pattern = trimmedLine;
      
      // Add ** to the beginning of the pattern if it doesn't start with /
      if (!pattern.startsWith('/')) {
        pattern = `**/${pattern}`;
      } else {
        // Remove leading / to match our pattern format
        pattern = pattern.substring(1);
      }
      
      // Add trailing /** if the pattern ends with /
      if (pattern.endsWith('/')) {
        pattern = `${pattern}**`;
      }
      
      patterns.push(pattern);
    }
    
    return patterns;
  }
}

module.exports = { GitignoreParser };
