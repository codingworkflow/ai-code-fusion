const fs = require('fs');
// eslint-disable-next-line no-unused-vars
const path = require('path');
const filterUtils = require('./filter-utils');

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
    const ext = path.extname(filePath);

    // Explicit check for node_modules
    if (normalizedPath.split('/').includes('node_modules')) {
      return false;
    }

    // 1. Extension filtering - apply unless explicitly disabled
    if (
      this.config.use_custom_includes !== false &&
      this.config.include_extensions &&
      Array.isArray(this.config.include_extensions) &&
      ext
    ) {
      if (!this.config.include_extensions.includes(ext.toLowerCase())) {
        return false; // Exclude files with extensions not in the include list
      }
    }

    // 2. Build patterns array with proper structure and priority
    const patterns = [];

    // Add custom exclude patterns (highest priority)
    if (
      this.config.use_custom_excludes !== false &&
      this.config.exclude_patterns &&
      Array.isArray(this.config.exclude_patterns)
    ) {
      patterns.push(...this.config.exclude_patterns);
    }

    // Add gitignore exclude patterns
    if (this.useGitignore && this.gitignorePatterns && this.gitignorePatterns.excludePatterns) {
      patterns.push(...this.gitignorePatterns.excludePatterns);
    }

    // Add include patterns property for gitignore negated patterns
    if (this.useGitignore && this.gitignorePatterns && this.gitignorePatterns.includePatterns) {
      patterns.includePatterns = this.gitignorePatterns.includePatterns;
    }

    // 3. Use the shouldExclude utility for consistent pattern matching
    if (filterUtils.shouldExclude(filePath, '', patterns, this.config)) {
      return false; // File should be excluded based on pattern matching
    }

    // If we reach this point, the file should be processed
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
