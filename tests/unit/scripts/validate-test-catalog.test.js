jest.unmock('fs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  extractCatalogPathReferences,
  validateTestCatalog,
} = require('../../../scripts/validate-test-catalog');

function writeFile(rootDir, relativePath, content = '') {
  const absolutePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'validate-test-catalog-'));
}

describe('validate-test-catalog script', () => {
  test('extracts unique test catalog references from markdown content', () => {
    const content = `
# Test Catalog
- \`tests/unit/a.test.ts\`
- \`tests/unit/a.test.ts\`
- \`tests/integration/b.test.ts\`
`;

    expect(extractCatalogPathReferences(content)).toEqual([
      'tests/integration/b.test.ts',
      'tests/unit/a.test.ts',
    ]);
  });

  test('passes when catalog references existing paths and discovered tests', () => {
    const rootDir = createWorkspace();

    writeFile(rootDir, 'tests/catalog.md', [
      '`tests/unit/a.test.ts`',
      '`tests/integration/b.test.ts`',
      '`tests/e2e/e2e.spec.ts`',
    ].join('\n'));
    writeFile(rootDir, 'tests/unit/a.test.ts', 'test("a", () => expect(true).toBe(true));');
    writeFile(rootDir, 'tests/integration/b.test.ts', 'test("b", () => expect(true).toBe(true));');
    writeFile(rootDir, 'tests/e2e/e2e.spec.ts', 'test("e2e", () => expect(true).toBe(true));');

    const report = validateTestCatalog({
      rootDir,
      catalogPath: path.join(rootDir, 'tests/catalog.md'),
      jestConfig: {
        testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
        testPathIgnorePatterns: ['/tests/e2e/'],
      },
    });

    expect(report.isValid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.discoveredTestFiles).toEqual([
      'tests/integration/b.test.ts',
      'tests/unit/a.test.ts',
    ]);

    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('fails when catalog references missing paths', () => {
    const rootDir = createWorkspace();

    writeFile(rootDir, 'tests/catalog.md', '`tests/unit/missing.test.ts`');

    const report = validateTestCatalog({
      rootDir,
      catalogPath: path.join(rootDir, 'tests/catalog.md'),
      jestConfig: {
        testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
        testPathIgnorePatterns: [],
      },
    });

    expect(report.isValid).toBe(false);
    expect(report.missingCatalogPaths).toEqual(['tests/unit/missing.test.ts']);
    expect(report.errors[0]).toContain('Catalog references missing paths');

    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('fails when discovered tests are not listed in the catalog', () => {
    const rootDir = createWorkspace();

    writeFile(rootDir, 'tests/catalog.md', '`tests/unit/a.test.ts`');
    writeFile(rootDir, 'tests/unit/a.test.ts', 'test("a", () => expect(true).toBe(true));');
    writeFile(rootDir, 'tests/unit/forgotten.test.ts', 'test("forgotten", () => expect(true).toBe(true));');

    const report = validateTestCatalog({
      rootDir,
      catalogPath: path.join(rootDir, 'tests/catalog.md'),
      jestConfig: {
        testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
        testPathIgnorePatterns: [],
      },
    });

    expect(report.isValid).toBe(false);
    expect(report.unlistedDiscoveredTestFiles).toEqual(['tests/unit/forgotten.test.ts']);
    expect(report.errors[0]).toContain('Discovered tests missing from catalog');

    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('fails when cataloged test locations are not discovered by Jest patterns', () => {
    const rootDir = createWorkspace();

    writeFile(rootDir, 'tests/catalog.md', [
      '`tests/unit/a.test.ts`',
      '`tests/stress/out-of-scope.test.ts`',
    ].join('\n'));
    writeFile(rootDir, 'tests/unit/a.test.ts', 'test("a", () => expect(true).toBe(true));');
    writeFile(
      rootDir,
      'tests/stress/out-of-scope.test.ts',
      'test("stress", () => expect(true).toBe(true));'
    );

    const report = validateTestCatalog({
      rootDir,
      catalogPath: path.join(rootDir, 'tests/catalog.md'),
      jestConfig: {
        testMatch: ['<rootDir>/tests/{unit,integration}/**/*.{js,jsx,ts,tsx}'],
        testPathIgnorePatterns: [],
      },
    });

    expect(report.isValid).toBe(false);
    expect(report.listedButNotDiscoveredTestFiles).toEqual(['tests/stress/out-of-scope.test.ts']);
    expect(report.errors[0]).toContain('Catalog lists tests not discovered by Jest');

    fs.rmSync(rootDir, { recursive: true, force: true });
  });
});
