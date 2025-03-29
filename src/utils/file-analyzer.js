const fs = require('fs');
const path = require('path');
const { compilePatterns, matchAnyCompiledPattern } = require('./pattern-matcher');
const { normalizePath } = require('./path-utils');

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
    
    // Pre-compile patterns for better performance
    this.compiledCustomExcludePatterns = config.exclude_patterns ? 
      compilePatterns(config.exclude_patterns) : [];
    
    // Handle gitignore patterns
    if (this.useGitignore) {
      // Use compiled patterns if available, otherwise compile them
      if (this.gitignorePatterns.compiledExcludePatterns) {
        this.compiledGitignoreExcludePatterns = this.gitignorePatterns.compiledExcludePatterns;
      } else if (this.gitignorePatterns.excludePatterns) {
        this.compiledGitignoreExcludePatterns = compilePatterns(this.gitignorePatterns.excludePatterns);
      } else {
        this.compiledGitignoreExcludePatterns = [];
      }
      
      // Same for include patterns
      if (this.gitignorePatterns.compiledIncludePatterns) {
        this.compiledGitignoreIncludePatterns = this.gitignorePatterns.compiledIncludePatterns;
      } else if (this.gitignorePatterns.includePatterns) {
        this.compiledGitignoreIncludePatterns = compilePatterns(this.gitignorePatterns.includePatterns);
      } else {
        this.compiledGitignoreIncludePatterns = [];
      }
    } else {
      this.compiledGitignoreExcludePatterns = [];
      this.compiledGitignoreIncludePatterns = [];
    }
  }

  shouldProcessFile(filePath) {
    // Convert path to forward slashes for consistent pattern matching
    const normalizedPath = normalizePath(filePath);

    // Get configuration settings
    const useCustomExcludes = this.config.use_custom_excludes !== false;
    const filterByExtension = this.config.filter_by_extension !== false;

    // Check custom exclude patterns if enabled
    if (useCustomExcludes && this.compiledCustomExcludePatterns.length > 0) {
      // Check explicitly for excluded patterns
      const isExcluded = matchAnyCompiledPattern(normalizedPath, this.compiledCustomExcludePatterns);
      if (isExcluded) {
        console.log(`Excluded by custom pattern: ${normalizedPath}`);
        return false;
      }
    }

    // First check include patterns (negated gitignore patterns)
    // These have highest priority as per gitignore standard behavior
    if (this.useGitignore && this.compiledGitignoreIncludePatterns.length > 0) {
      if (matchAnyCompiledPattern(normalizedPath, this.compiledGitignoreIncludePatterns)) {
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
    if (this.useGitignore && this.compiledGitignoreExcludePatterns.length > 0) {
      if (matchAnyCompiledPattern(normalizedPath, this.compiledGitignoreExcludePatterns)) {
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
