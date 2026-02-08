import '@testing-library/jest-dom';

// Add a dummy test to avoid Jest warning about no tests
describe('Setup validation', () => {
  test('Jest is configured correctly', () => {
    expect(true).toBe(true);
  });
});

// Note: We need to be careful with mocking pattern matching utilities
// as it can affect test reliability

// Mock the tiktoken module
jest.mock('tiktoken', () => ({
  encoding_for_model: jest.fn().mockImplementation(() => ({
    encode: jest.fn().mockImplementation(() => Array(10)),
  })),
}));

// Mock Electron's APIs
window.electronAPI = {
  selectDirectory: jest.fn().mockResolvedValue('/mock/directory'),
  getDirectoryTree: jest.fn().mockResolvedValue([]),
  saveFile: jest.fn().mockResolvedValue('/mock/output.md'),
  resetGitignoreCache: jest.fn().mockResolvedValue(true),
  analyzeRepository: jest.fn().mockResolvedValue({
    filesInfo: [],
    totalTokens: 0,
  }),
  processRepository: jest.fn().mockResolvedValue({
    content: '',
    totalTokens: 0,
    processedFiles: 0,
    skippedFiles: 0,
    filesInfo: [],
  }),
  getDefaultConfig: jest.fn().mockResolvedValue(''),
  getAssetPath: jest.fn().mockResolvedValue(null),
  countFilesTokens: jest.fn().mockResolvedValue({
    results: {},
    stats: {},
  }),
};

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock fs module functions that we use in various tests
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('mock content'),
  writeFileSync: jest.fn(),
  openSync: jest.fn().mockReturnValue(1),
  readSync: jest.fn().mockReturnValue(100),
  closeSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({
    size: 1024,
    mtime: new Date(),
    isDirectory: jest.fn().mockReturnValue(false),
  }),
  readdirSync: jest.fn().mockReturnValue([]),
}));

// Mock console methods to reduce test noise
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};
