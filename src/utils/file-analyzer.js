const fs = require('fs');
const path = require('path');

// Helper function to check if a file is an image based on extension
const isImageFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg', '.ico'].includes(ext);
};

// Define our own pattern matching function
// Don't try to require minimatch as it causes issues
const matchPattern = (filepath, pattern) => {
  try {
    // Simple implementation of glob pattern matching
    if (pattern.includes('*')) {
      // Escape special regex characters except * and ?
      const regexPattern = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        // Replace ** with a unique placeholder
        .replace(/\*\*/g, '__DOUBLE_STAR__')
        // Replace * with regex for any character except /
        .replace(/\*/g, '[^/]*')
        // Replace ? with regex for a single character
        .replace(/\?/g, '[^/]')
        // Replace the double star placeholder with regex for any character
        .replace(/__DOUBLE_STAR__/g, '.*');

      // Add start and end anchors
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(filepath);
    }

    // For simple patterns, just check if filepath ends with pattern
    return filepath === pattern || filepath.endsWith(`/${pattern}`);
  } catch (error) {
    console.error(`Error in pattern matching ${pattern} against ${filepath}:`, error);
    // Super simple fallback
    return filepath.includes(pattern.replace('*', ''));
  }
};

class FileAnalyzer {
  constructor(config, tokenCounter, options = {}) {
    this.config = config;
    this.tokenCounter = tokenCounter;
    this.useGitignore = options.useGitignore || false;
    this.gitignorePatterns = options.gitignorePatterns || { 
      excludePatterns: [], 
      includePatterns: [] 
    };
  }

  shouldProcessFile(filePath) {
    // Convert path to forward slashes for consistent pattern matching
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check if path contains node_modules - explicit check
    if (normalizedPath.split('/').includes('node_modules')) {
      return false;
    }

    // Check if custom excludes are enabled (default to true if not specified)
    const useCustomExcludes = this.config.use_custom_excludes !== false;
    
    // Check custom exclude patterns if enabled
    if (useCustomExcludes) {
      // Check each part of the path against exclude patterns
      const pathParts = normalizedPath.split('/');
      for (let i = 0; i < pathParts.length; i++) {
        const currentPath = pathParts.slice(i).join('/');

        for (const pattern of this.config.exclude_patterns || []) {
          // Remove leading **/ from pattern for direct matching
          const cleanPattern = pattern.replace('**/', '');

          if (
            this._matchPattern(currentPath, cleanPattern) ||
            this._matchPattern(currentPath, pattern)
          ) {
            return false;
          }
        }
      }
    }
    
    // First check include patterns (negated gitignore patterns)
    // These have highest priority - if a file matches an include pattern, it should be processed
    if (this.useGitignore && this.gitignorePatterns.includePatterns && 
        this.gitignorePatterns.includePatterns.length > 0) {
      // Check each part of the path against include patterns
      const pathParts = normalizedPath.split('/');
      for (let i = 0; i < pathParts.length; i++) {
        const currentPath = pathParts.slice(i).join('/');

        for (const pattern of this.gitignorePatterns.includePatterns) {
          // Remove leading **/ from pattern for direct matching
          const cleanPattern = pattern.replace('**/', '');

          if (
            this._matchPattern(currentPath, cleanPattern) ||
            this._matchPattern(currentPath, pattern)
          ) {
            // If matches an include pattern, we should process this file
            // Skip the exclude checks and go straight to extension check
            const ext = path.extname(filePath).toLowerCase();
            return !useCustomExcludes || (this.config.include_extensions || []).includes(ext);
          }
        }
      }
    }
    
    // Check gitignore exclude patterns if enabled
    if (this.useGitignore && this.gitignorePatterns.excludePatterns && 
        this.gitignorePatterns.excludePatterns.length > 0) {
      // Special handling for root-level files
      const isRootLevelFile = normalizedPath.indexOf('/') === -1;
      
      // Check for direct match first (important for root-level files)
      if (isRootLevelFile) {
        for (const pattern of this.gitignorePatterns.excludePatterns) {
          // Check if this is a simple pattern without wildcards or directory separators
          if (!pattern.includes('/') && !pattern.includes('*')) {
            if (normalizedPath === pattern) {
              return false; // Skip processing this file
            }
          }
        }
      }
      
      // Standard path part checking
      const pathParts = normalizedPath.split('/');
      for (let i = 0; i < pathParts.length; i++) {
        const currentPath = pathParts.slice(i).join('/');

        for (const pattern of this.gitignorePatterns.excludePatterns) {
          // Remove leading **/ from pattern for direct matching
          const cleanPattern = pattern.replace('**/', '');

          if (
            this._matchPattern(currentPath, cleanPattern) ||
            this._matchPattern(currentPath, pattern)
          ) {
            return false;
          }
        }
      }
    }

    // If custom excludes are enabled, check file extension
    if (useCustomExcludes) {
      // Get file extension
      const ext = path.extname(filePath).toLowerCase();
      // Check if extension is in included list
      return (this.config.include_extensions || []).includes(ext);
    }
    
    // If custom excludes are disabled, include all files that passed gitignore filters
    return true;
  }

  _matchPattern(filepath, pattern) {
    return matchPattern(filepath, pattern);
  }

  analyzeFile(filePath) {
    try {
      // Handle image files differently
      if (isImageFile(filePath)) {
        // For images, estimate tokens based on file size
        // This is a simple estimation - adjust as needed
        const stats = fs.statSync(filePath);
        // Very basic estimation: 1 token per 4 bytes with a minimum of 50 tokens
        return Math.max(50, Math.ceil(stats.size / 4));
      }
      
      // For text files, process normally
      const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
      return this.tokenCounter.countTokens(content);
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      return null;
    }
  }

  createAnalysis() {
    const totalTokens = 0;
    const filesInfo = [];

    // Implement the rest of the analysis logic if needed
    // This is handled by the main process in this implementation

    return {
      filesInfo,
      totalTokens,
    };
  }
}

module.exports = { FileAnalyzer, isImageFile };
