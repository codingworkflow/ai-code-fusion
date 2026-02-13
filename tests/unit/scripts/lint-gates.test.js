const fs = jest.requireActual('fs');
const path = jest.requireActual('path');

const packageJsonPath = path.resolve(__dirname, '../../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

describe('lint and format gate scripts', () => {
  test('lint command covers scripts and config files', () => {
    const lintScript = packageJson.scripts.lint;

    expect(lintScript).toContain('eslint src tests scripts');
    expect(lintScript).toContain('eslint.config.js');
    expect(lintScript).toContain('.eslintrc.js');
    expect(lintScript).toContain('playwright.config.ts');
    expect(lintScript).toContain('--max-warnings 0');
  });

  test('format:check enforces JS/TS formatting for scripts and configs', () => {
    const formatCheckScript = packageJson.scripts['format:check'];

    expect(formatCheckScript).toContain('scripts/**/*.js');
    expect(formatCheckScript).toContain('*.config.js');
    expect(formatCheckScript).toContain('playwright.config.ts');
  });

  test('lint-staged includes scripts path coverage', () => {
    const lintStagedKeys = Object.keys(packageJson['lint-staged'] ?? {});

    expect(lintStagedKeys).toContain('{src,tests,scripts}/**/*.{js,jsx,ts,tsx}');
  });
});
