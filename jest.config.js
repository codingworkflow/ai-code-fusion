module.exports = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Mock yaml module to fix import issues
    '^yaml$': '<rootDir>/tests/mocks/yaml-mock.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  // Needed to transform ESM modules
  transformIgnorePatterns: ['/node_modules/(?!(yaml)/)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Test match patterns
  testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
  // Set verbose mode for more information during test runs
  verbose: true,
  // Add test coverage reports
  collectCoverage: false,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/src/renderer/components/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/utils/**/*.{js,ts}',
    '!<rootDir>/src/**/*.d.ts',
    '!**/node_modules/**',
  ],
};
