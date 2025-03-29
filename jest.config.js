module.exports = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  // Test match patterns
  testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
  // Set verbose mode for more information during test runs
  verbose: true,
  // Add test coverage reports
  collectCoverage: false,
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    '<rootDir>/src/renderer/components/**/*.{js,jsx}',
    '<rootDir>/src/utils/**/*.js',
    '!<rootDir>/src/**/*.d.ts',
    '!**/node_modules/**',
  ],
};
