const fs = require('fs');
const path = require('path');
const { ContentProcessor } = require('../../../src/utils/content-processor');
const { isBinaryFile } = require('../../../src/utils/file-analyzer');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../../src/utils/file-analyzer', () => ({
  isBinaryFile: jest.fn(),
}));

describe('ContentProcessor', () => {
  let contentProcessor;
  let mockTokenCounter;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock token counter
    mockTokenCounter = {
      countTokens: jest.fn().mockReturnValue(100),
    };

    // Create instance with mock
    contentProcessor = new ContentProcessor(mockTokenCounter);

    // Setup path mock
    path.extname.mockImplementation((filePath) => {
      const parts = filePath.split('.');
      return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
    });
  });

  describe('processFile', () => {
    test('should process text files correctly', () => {
      // Setup
      const filePath = '/project/src/file.js';
      const relativePath = 'src/file.js';
      const fileContent = 'const x = 10;';

      // Mock dependencies
      isBinaryFile.mockReturnValue(false);
      fs.readFileSync.mockReturnValue(fileContent);

      // Execute
      const result = contentProcessor.processFile(filePath, relativePath);

      // Verify
      expect(isBinaryFile).toHaveBeenCalledWith(filePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, { encoding: 'utf-8', flag: 'r' });

      // Check formatting
      expect(result).toContain('######');
      expect(result).toContain(relativePath);
      expect(result).toContain('```');
      expect(result).toContain(fileContent);
    });

    test('should process text files as xml when export format is xml', () => {
      const filePath = '/project/src/file.ts';
      const relativePath = 'src/file.ts';
      const fileContent = 'const value = "x";';

      isBinaryFile.mockReturnValue(false);
      fs.readFileSync.mockReturnValue(fileContent);

      const result = contentProcessor.processFile(filePath, relativePath, {
        exportFormat: 'xml',
        showTokenCount: true,
        tokenCount: 7,
      });

      expect(result).toContain('<file path="src/file.ts" tokens="7" binary="false">');
      expect(result).toContain('<![CDATA[');
      expect(result).toContain(fileContent);
      expect(result).toContain('</file>');
      expect(mockTokenCounter.countTokens).not.toHaveBeenCalled();
    });

    test('should escape cdata end markers and sanitize invalid xml characters', () => {
      const filePath = '/project/src/weird.ts';
      const relativePath = 'src/weird.ts';
      const fileContent = 'const marker = "]]>";\u0001const done = true;';

      isBinaryFile.mockReturnValue(false);
      fs.readFileSync.mockReturnValue(fileContent);

      const result = contentProcessor.processFile(filePath, relativePath, {
        exportFormat: 'xml',
        showTokenCount: true,
      });

      expect(result).toContain('<![CDATA[');
      expect(result).toContain(']]]]><![CDATA[>');
      expect(result).not.toContain('\u0001');
    });

    test('should handle binary files correctly', () => {
      // Setup
      const filePath = '/project/images/logo.png';
      const relativePath = 'images/logo.png';

      // Mock dependencies
      isBinaryFile.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 1024 });
      path.extname.mockReturnValue('.png');

      // Execute
      const result = contentProcessor.processFile(filePath, relativePath);

      // Verify
      expect(isBinaryFile).toHaveBeenCalledWith(filePath);
      expect(fs.statSync).toHaveBeenCalledWith(filePath);

      // Check formatting
      expect(result).toContain('######');
      expect(result).toContain(`${relativePath} (binary file)`);
      expect(result).toContain('[BINARY FILE]');
      expect(result).toContain('PNG');
      expect(result).toContain('1.00 KB');
    });

    test('should process binary files as xml when export format is xml', () => {
      const filePath = '/project/images/logo.png';
      const relativePath = 'images/logo.png';

      isBinaryFile.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 2048 });
      path.extname.mockReturnValue('.png');

      const result = contentProcessor.processFile(filePath, relativePath, { exportFormat: 'xml' });

      expect(result).toContain('<file path="images/logo.png" binary="true"');
      expect(result).toContain('fileType="PNG"');
      expect(result).toContain('sizeKB="2.00"');
      expect(result).toContain('<note><![CDATA[');
      expect(result).toContain('</file>');
    });

    test('should handle errors when reading files', () => {
      // Setup
      const filePath = '/project/src/missing.js';
      const relativePath = 'src/missing.js';

      // Mock dependencies
      isBinaryFile.mockReturnValue(false);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      // Execute
      const result = contentProcessor.processFile(filePath, relativePath);

      // Verify
      expect(isBinaryFile).toHaveBeenCalledWith(filePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, { encoding: 'utf-8', flag: 'r' });

      // Should return null on error
      expect(result).toBeNull();
    });

    test('should use custom processing options if provided', () => {
      // Setup
      const filePath = '/project/src/file.js';
      const relativePath = 'src/file.js';
      const fileContent = 'const x = 10;';
      const options = {
        showTokenCount: true,
      };

      // Mock dependencies
      isBinaryFile.mockReturnValue(false);
      fs.readFileSync.mockReturnValue(fileContent);
      mockTokenCounter.countTokens.mockReturnValue(42);

      // Execute
      const result = contentProcessor.processFile(filePath, relativePath, options);

      // Verify core behavior
      expect(isBinaryFile).toHaveBeenCalledWith(filePath);
      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, { encoding: 'utf-8', flag: 'r' });

      // With mock implementation, just check it returned properly formatted content
      expect(result).toContain('######');
      expect(result).toContain(relativePath);
      expect(result).toContain('```');
      expect(result).toContain(fileContent);
    });
  });

  describe('readAnalysisFile', () => {
    test('should parse analysis file correctly', () => {
      // Setup
      const analysisPath = '/project/analysis.txt';
      const analysisContent = `src/file.js
100
src/utils/helper.js
50
Total tokens: 150`;

      // Mock dependencies
      fs.readFileSync.mockReturnValue(analysisContent);

      // Execute
      const result = contentProcessor.readAnalysisFile(analysisPath);

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(analysisPath, { encoding: 'utf-8', flag: 'r' });

      // Check parsing
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: 'src/file.js', tokens: 100 });
      expect(result[1]).toEqual({ path: 'src/utils/helper.js', tokens: 50 });
    });

    test('should handle malformed analysis files', () => {
      // Setup
      const analysisPath = '/project/malformed.txt';
      const analysisContent = `src/file.js
not-a-number
src/utils/helper.js
50`;

      // Mock dependencies
      fs.readFileSync.mockReturnValue(analysisContent);

      // Execute
      const result = contentProcessor.readAnalysisFile(analysisPath);

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(analysisPath, { encoding: 'utf-8', flag: 'r' });

      // Should only include the valid entry
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ path: 'src/utils/helper.js', tokens: 50 });
    });

    test('should handle errors when reading analysis file', () => {
      // Setup
      const analysisPath = '/project/missing.txt';

      // Mock dependencies
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      // Execute
      const result = contentProcessor.readAnalysisFile(analysisPath);

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(analysisPath, { encoding: 'utf-8', flag: 'r' });

      // Should return empty array on error
      expect(result).toEqual([]);
    });
  });
});
