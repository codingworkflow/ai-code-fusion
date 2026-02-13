const fs = jest.requireActual('fs');
const path = jest.requireActual('path');

const eslintConfigPath = path.resolve(__dirname, '../../../eslint.config.js');
const eslintConfigSource = fs.readFileSync(eslintConfigPath, 'utf8');

describe('eslint phase 2 strict packs config', () => {
  test('scopes strict packs to source files and excludes test files', () => {
    expect(eslintConfigSource).toContain("files: ['src/**/*.{js,jsx,ts,tsx}']");
    expect(eslintConfigSource).toContain("'src/**/__tests__/**'");
    expect(eslintConfigSource).toContain("'src/**/*.test.{js,jsx,ts,tsx}'");
    expect(eslintConfigSource).toContain("'src/**/*.spec.{js,jsx,ts,tsx}'");
  });

  test('enforces selected sonarjs and unicorn rules', () => {
    expect(eslintConfigSource).toContain("'sonarjs/no-collapsible-if': 'error'");
    expect(eslintConfigSource).toContain("'sonarjs/no-identical-conditions': 'error'");
    expect(eslintConfigSource).toContain("'sonarjs/no-identical-expressions': 'error'");
    expect(eslintConfigSource).toContain("'sonarjs/no-ignored-return': 'error'");
    expect(eslintConfigSource).toContain("'sonarjs/no-inverted-boolean-check': 'error'");
    expect(eslintConfigSource).toContain("'unicorn/no-array-callback-reference': 'error'");
    expect(eslintConfigSource).toContain("'unicorn/no-invalid-fetch-options': 'error'");
    expect(eslintConfigSource).toContain("'unicorn/prefer-array-some': 'error'");
    expect(eslintConfigSource).toContain("'unicorn/prefer-optional-catch-binding': 'error'");
    expect(eslintConfigSource).toContain("'unicorn/prefer-string-starts-ends-with': 'error'");
  });

  test('wires project-specific electron safety rules', () => {
    expect(eslintConfigSource).toContain("'electron-security/ipc-channel-namespaced': 'error'");
    expect(eslintConfigSource).toContain(
      "'electron-security/safe-browser-window-webpreferences': 'error'"
    );
    expect(eslintConfigSource).toContain(
      "'electron-security/no-electron-import-in-renderer': 'error'"
    );
  });

  test('includes scripts/config lint scope and does not globally ignore scripts', () => {
    expect(eslintConfigSource).toContain("'scripts/**/*.js'");
    expect(eslintConfigSource).toContain("'*.config.js'");
    expect(eslintConfigSource).toContain("sourceType: 'commonjs'");
    expect(eslintConfigSource).not.toContain("'scripts/**',");
  });
});
