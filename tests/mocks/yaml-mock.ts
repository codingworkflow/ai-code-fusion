// Mock implementation of yaml module for testing
const yamlMock = {
  parse: jest.fn((yamlString) => {
    // Simple mock implementation
    // For testing, we'll handle some basic cases
    if (!yamlString || yamlString.trim() === '') {
      return {};
    }

    // Return a mock object for testing
    if (yamlString.includes('include_extensions')) {
      return {
        include_extensions: ['.js', '.jsx'],
        use_custom_includes: true,
        use_gitignore: true,
        exclude_patterns: ['**/node_modules/**'],
      };
    }

    return {
      default_value: 'mock_value',
    };
  }),
  stringify: jest.fn((obj) => {
    // Simple stringification for testing
    return JSON.stringify(obj, null, 2).replace(/"/g, '').replace(/\{/g, '').replace(/\}/g, '');
  }),
};

module.exports = yamlMock;
