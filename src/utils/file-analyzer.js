const fs = require('fs');
// eslint-disable-next-line no-unused-vars
const path = require('path');
const { shouldExclude } = require('./filter-utils');

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
    // The root path is not accessible directly, so we need to extract it from the first part of the path
    // In practice, filePath is already relative to the root since it's passed that way from the main process

    // Convert path to forward slashes for consistent pattern matching
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Note: path module is used elsewhere in the class for path.extname

    // Check if path contains node_modules - explicit check
    if (normalizedPath.split('/').includes('node_modules')) {
      return false;
    }

    // Combine pattern arrays for use with shouldExclude
    const excludePatterns = [];

    // Add gitignore patterns if enabled
    if (this.useGitignore && this.gitignorePatterns) {
      // Add includePatterns property for negated gitignore patterns
      excludePatterns.includePatterns = this.gitignorePatterns.includePatterns;

      // Add exclude patterns
      if (this.gitignorePatterns.excludePatterns) {
        excludePatterns.push(...this.gitignorePatterns.excludePatterns);
      }
    }

    // Add custom exclude patterns if enabled
    if (this.config.use_custom_excludes !== false) {
      excludePatterns.push(...(this.config.exclude_patterns || []));
    }

    // We need to emulate shouldExclude without a rootPath since this is a relative path already
    // Simply invert the result of shouldExclude
    return !shouldExclude(filePath, '', excludePatterns, this.config);
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
