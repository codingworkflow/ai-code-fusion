const fs = require('fs');
const path = require('path');
const { matchPattern, matchAnyPattern } = require('./pattern-matcher');

// Helper function to check if a file is a binary file by examining content
const isBinaryFile = (filePath) => {
  try {
    // Read the first 4KB of the file to check for binary content
    const buffer = Buffer.alloc(4096);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    if (bytesRead === 0) {
      // Empty file, consider it text
      return false;
    }

    // Check for NULL bytes and control characters (except common whitespace controls)
    // This is a reliable indicator of binary content
    let controlChars = 0;
    const totalBytes = bytesRead;

    for (let i = 0; i < bytesRead; i++) {
      // NULL byte check
      if (buffer[i] === 0) {
        return true; // Null bytes are a clear sign of binary content
      }

      // Control character check (except tab, newline, carriage return)
      if (buffer[i] < 32 && buffer[i] !== 9 && buffer[i] !== 10 && buffer[i] !== 13) {
        controlChars++;
      }
    }

    // If more than 10% of the file consists of control characters, consider it binary
    const ratio = controlChars / totalBytes;
    return ratio > 0.1;
  } catch (error) {
    console.error(`Error checking if file is binary: ${filePath}`, error);
    // If we can't read the file, safer to consider it binary
    return true;
  }
};

// We're now using the shared pattern-matcher.js utility instead of this local function

class FileAnalyzer {
  constructor(config, tokenCounter, options = {}) {
    this.config = config;
    this.tokenCounter = tokenCounter;
    this.useGitignore = options.useGitignore || false;
    this.gitignorePatterns = options.gitignorePatterns || {
      excludePatterns: [],
      includePatterns: [],
    };
  }

  shouldProcessFile(filePath) {
    // Convert path to forward slashes for consistent pattern matching
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check if path contains node_modules - explicit check
    if (normalizedPath.split('/').includes('node_modules')) {
      return false;
    }

    // Get configuration settings
    const useCustomExcludes = this.config.use_custom_excludes !== false;
    const filterByExtension = this.config.filter_by_extension !== false;

    // Check custom exclude patterns if enabled
    if (useCustomExcludes && this.config.exclude_patterns && this.config.exclude_patterns.length > 0) {
      // Use enhanced pattern matching from our utility
      if (matchAnyPattern(normalizedPath, this.config.exclude_patterns)) {
        return false;
      }
    }

    // First check include patterns (negated gitignore patterns)
    // These have highest priority as per gitignore standard behavior
    if (
      this.useGitignore &&
      this.gitignorePatterns.includePatterns &&
      this.gitignorePatterns.includePatterns.length > 0
    ) {
      if (matchAnyPattern(normalizedPath, this.gitignorePatterns.includePatterns)) {
        // File matches a gitignore include pattern
        // Still need to check extension filtering if enabled
        if (filterByExtension) {
          const ext = path.extname(filePath).toLowerCase();
          return (this.config.include_extensions || []).includes(ext);
        }
        return true;
      }
    }

    // Check gitignore exclude patterns if enabled
    if (
      this.useGitignore &&
      this.gitignorePatterns.excludePatterns &&
      this.gitignorePatterns.excludePatterns.length > 0
    ) {
      if (matchAnyPattern(normalizedPath, this.gitignorePatterns.excludePatterns)) {
        return false;
      }
    }

    // Check file extension independently from custom excludes
    if (filterByExtension) {
      const ext = path.extname(filePath).toLowerCase();
      return (this.config.include_extensions || []).includes(ext);
    }

    // If we reach here and none of the filters applied, include the file
    return true;
  }

  analyzeFile(filePath) {
    try {
      // Skip binary files completely
      if (isBinaryFile(filePath)) {
        console.log(`Skipping binary file: ${filePath}`);
        return null;
      }

      // Process text files only
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

  // Additional method to check if file should be processed before reading it
  shouldReadFile(filePath) {
    // Skip binary files completely
    return !isBinaryFile(filePath);
  }
}

module.exports = { FileAnalyzer, isBinaryFile };
