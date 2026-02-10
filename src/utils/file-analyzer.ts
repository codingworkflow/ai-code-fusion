import fs from 'fs';
import path from 'path';
import { shouldExclude } from './filter-utils';
import { scanContentForSecretsWithPolicy } from './secret-scanner';
import type { ConfigObject } from '../types/ipc';
import type { TokenCounter } from './token-counter';
import type { GitignorePatterns } from './gitignore-parser';

// Helper function to check if a file is a binary file by examining content
export const isBinaryFile = (filePath: string): boolean => {
  try {
    // Read the first 4KB of the file to check for binary content
    const buffer = Buffer.alloc(4096, 0x20);
    const fd = fs.openSync(filePath, 'r');
    const bytesReadRaw = fs.readSync(fd, buffer, 0, 4096, 0);
    const bytesRead = typeof bytesReadRaw === 'number' ? bytesReadRaw : 0;
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
  private readonly config: ConfigObject;
  private readonly tokenCounter: TokenCounter;
  private readonly useGitignore: boolean;
  private readonly gitignorePatterns: GitignorePatterns;

  constructor(
    config: ConfigObject,
    tokenCounter: TokenCounter,
    options: { useGitignore?: boolean; gitignorePatterns?: GitignorePatterns } = {}
  ) {
    this.config = config;
    this.tokenCounter = tokenCounter;
    this.useGitignore = options.useGitignore ?? false;
    this.gitignorePatterns = options.gitignorePatterns || {
      excludePatterns: [],
      includePatterns: [],
    };
  }

  shouldProcessFile(filePath: string): boolean {
    // Convert path to forward slashes for consistent pattern matching
    const normalizedPath = filePath.replaceAll('\\', '/');
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
    const patterns: string[] & { includePatterns?: string[] } = [];

    // Add custom exclude patterns (highest priority)
    if (
      this.config.use_custom_excludes !== false &&
      this.config.exclude_patterns &&
      Array.isArray(this.config.exclude_patterns)
    ) {
      patterns.push(...this.config.exclude_patterns);
    }

    // Add gitignore exclude patterns
    if (this.useGitignore) {
      patterns.push(...this.gitignorePatterns.excludePatterns);
    }

    // Add include patterns property for gitignore negated patterns
    if (this.useGitignore) {
      patterns.includePatterns = this.gitignorePatterns.includePatterns;
    }

    // 3. Use the shouldExclude utility for consistent pattern matching
    if (shouldExclude(filePath, '', patterns, this.config)) {
      return false; // File should be excluded based on pattern matching
    }

    // If we reach this point, the file should be processed
    return true;
  }

  analyzeFile(filePath: string): number | null {
    try {
      // Skip binary files completely
      if (isBinaryFile(filePath)) {
        console.log(`Skipping binary file: ${filePath}`);
        return null;
      }

      // Process text files only
      const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });

      const secretScanResult = scanContentForSecretsWithPolicy(content, this.config);
      if (secretScanResult.isSuspicious) {
        console.warn(`Skipping suspicious file during analysis: ${filePath}`);
        return null;
      }

      return this.tokenCounter.countTokens(content);
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error);
      return null;
    }
  }

  createAnalysis(): { filesInfo: Array<{ path: string; tokens: number }>; totalTokens: number } {
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
  shouldReadFile(filePath: string): boolean {
    // Skip binary files completely
    return !isBinaryFile(filePath);
  }
}

export { FileAnalyzer };
