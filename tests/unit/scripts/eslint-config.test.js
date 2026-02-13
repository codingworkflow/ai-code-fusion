const eslintConfig = require('../../../.eslintrc.js');

describe('Setup validation', () => {
  test('Jest is configured correctly', () => {
    expect(typeof describe).toBe('function');
    expect(typeof test).toBe('function');
    expect(typeof expect).toBe('function');
  });
});

describe('eslint phase 2 strict packs config', () => {
  function getSourceStrictnessOverride() {
    return (eslintConfig.overrides || []).find((override) =>
      Array.isArray(override.files) && override.files.includes('src/**/*.{js,jsx,ts,tsx}')
    );
  }

  test('loads unicorn and sonarjs plugins', () => {
    expect(eslintConfig.plugins).toEqual(
      expect.arrayContaining(['sonarjs', 'unicorn'])
    );
  });

  test('scopes strict packs to source files and excludes test files', () => {
    const strictnessOverride = getSourceStrictnessOverride();

    expect(strictnessOverride).toBeDefined();
    expect(strictnessOverride.excludedFiles).toEqual(
      expect.arrayContaining([
        'src/**/__tests__/**',
        'src/**/*.test.{js,jsx,ts,tsx}',
        'src/**/*.spec.{js,jsx,ts,tsx}',
      ])
    );
  });

  test('enforces selected sonarjs and unicorn rules', () => {
    const strictnessOverride = getSourceStrictnessOverride();

    expect(strictnessOverride.rules).toMatchObject({
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-ignored-return': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'unicorn/no-array-callback-reference': 'error',
      'unicorn/no-invalid-fetch-options': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
    });
  });
});
