module.exports = {
  env: {
    jest: true,
    node: true,
  },
  extends: [
    '../.eslintrc.js',
  ],
  // Add specific rules for test files
  rules: {
    // Allow console statements in tests for debugging
    'no-console': 'off',
    // Allow expects in tests
    'jest/valid-expect': 'off',
    // Add more test-specific rules as needed
  },
};
