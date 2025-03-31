const fs = require('fs');
const yaml = require('yaml');

// Mock path BEFORE requiring the module under test
const mockConfigPath = '/mock/path/config.default.yaml';
jest.mock('path', () => {
  const originalPath = jest.requireActual('path');
  return {
    ...originalPath,
    join: jest.fn((...args) => {
      // Specifically intercept calls for config.default.yaml
      if (args.length >= 2 && args[args.length - 1] === 'config.default.yaml') {
        return mockConfigPath;
      }
      return args.join('/');
    }),
  };
});

// Mock other dependencies
jest.mock('fs');
jest.mock('yaml');

// NOW require the module under test
const { loadDefaultConfig, getDefaultConfigObject } = require('../../../src/utils/config-manager');

describe('config-manager', () => {
  const mockConfigContent = `
    # Default configuration
    use_custom_excludes: true
    use_gitignore: true

    # Extensions
    include_extensions:
      - .js
      - .jsx

    # Patterns
    exclude_patterns:
      - "**/node_modules/**"
      - "**/.git/**"
  `;

  const mockConfigObject = {
    use_custom_excludes: true,
    use_gitignore: true,
    include_extensions: ['.js', '.jsx'],
    exclude_patterns: ['**/node_modules/**', '**/.git/**'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadDefaultConfig', () => {
    test('should load default config file correctly', () => {
      // Setup
      fs.readFileSync.mockReturnValue(mockConfigContent);

      // Execute
      const result = loadDefaultConfig();

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(result).toBe(mockConfigContent);
    });

    test('should handle errors and return empty config', () => {
      // Setup
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      // Execute
      const result = loadDefaultConfig();

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(result).toBe('{}');
    });
  });

  describe('getDefaultConfigObject', () => {
    test('should parse default config to object', () => {
      // Setup
      fs.readFileSync.mockReturnValue(mockConfigContent);
      yaml.parse.mockReturnValue(mockConfigObject);

      // Execute
      const result = getDefaultConfigObject();

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(yaml.parse).toHaveBeenCalledWith(mockConfigContent);
      expect(result).toEqual(mockConfigObject);
    });

    test('should handle parsing errors and return empty object', () => {
      // Setup
      fs.readFileSync.mockReturnValue(mockConfigContent);
      yaml.parse.mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      // Execute
      const result = getDefaultConfigObject();

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(yaml.parse).toHaveBeenCalledWith(mockConfigContent);
      expect(result).toEqual({});
    });

    test('should handle file read errors and return empty object', () => {
      // Setup
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      // Execute
      const result = getDefaultConfigObject();

      // Verify
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      expect(result).toEqual({});
    });
  });
});
