// Mock implementation of yaml module for testing
const yamlMock = {
  parse: jest.fn((yamlString) => {
    // Simple mock implementation
    // For testing, we'll handle some basic cases
    if (!yamlString || yamlString.trim() === '') {
      return {};
    }

    const parsedConfig: Record<string, unknown> = {};

    if (yamlString.includes('include_extensions')) {
      parsedConfig.include_extensions = ['.js', '.jsx'];
      parsedConfig.use_custom_includes = true;
      parsedConfig.use_gitignore = true;
      parsedConfig.exclude_patterns = ['**/node_modules/**'];
    }

    if (/export_format\s*:\s*xml/.test(yamlString)) {
      parsedConfig.export_format = 'xml';
    } else if (/export_format\s*:\s*markdown/.test(yamlString)) {
      parsedConfig.export_format = 'markdown';
    }

    if (/include_tree_view\s*:\s*true/.test(yamlString)) {
      parsedConfig.include_tree_view = true;
    }

    if (/show_token_count\s*:\s*true/.test(yamlString)) {
      parsedConfig.show_token_count = true;
    }

    if (/provider\s*:/.test(yamlString)) {
      const providerConfig: Record<string, string> = {};
      const providerIdMatch = yamlString.match(/id\s*:\s*([^\n]+)/);
      const providerModelMatch = yamlString.match(/model\s*:\s*([^\n]+)/);
      const providerApiKeyMatch = yamlString.match(/api_key\s*:\s*([^\n]+)/);
      const providerBaseUrlMatch = yamlString.match(/base_url\s*:\s*([^\n]+)/);

      if (providerIdMatch?.[1]) {
        providerConfig.id = providerIdMatch[1].trim();
      }
      if (providerModelMatch?.[1]) {
        providerConfig.model = providerModelMatch[1].trim();
      }
      if (providerApiKeyMatch?.[1]) {
        providerConfig.api_key = providerApiKeyMatch[1].trim();
      }
      if (providerBaseUrlMatch?.[1]) {
        providerConfig.base_url = providerBaseUrlMatch[1].trim();
      }

      parsedConfig.provider = providerConfig;
    }

    if (Object.keys(parsedConfig).length > 0) {
      return parsedConfig;
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
