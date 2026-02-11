jest.unmock('fs');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  compileIgnorePatterns,
  extractCatalogPathReferences,
  resolvePathWithinRoot,
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

function withWorkspace(testFn) {
  const rootDir = createWorkspace();
  const cleanup = () => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  };

  try {
    const result = testFn(rootDir);
    if (result && typeof result.then === 'function') {
      return result.finally(cleanup);
    }

    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
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

  test('extracts wildcard and non-test catalog references as-is', () => {
    const content = `
# Test Catalog
- \`tests/unit/*.test.ts\`
- \`tests/README.md\`
`;

    expect(extractCatalogPathReferences(content)).toEqual(['tests/README.md', 'tests/unit/*.test.ts']);
  });

  test('returns a failure result when the test catalog cannot be read', () => {
    return withWorkspace((rootDir) => {
      const report = validateTestCatalog({
        rootDir,
        catalogPath: path.join(rootDir, 'tests', 'missing-catalog.md'),
        jestConfig: {
          testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
          testPathIgnorePatterns: [],
        },
      });

      expect(report.isValid).toBe(false);
      expect(report.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Unable to read test catalog')])
      );
      expect(report.catalogPathReferences).toEqual([]);
      expect(report.missingCatalogPaths).toEqual([]);
      expect(report.discoveredTestFiles).toEqual([]);
      expect(report.unlistedDiscoveredTestFiles).toEqual([]);
      expect(report.listedButNotDiscoveredTestFiles).toEqual([]);
      expect(report.warnings).toEqual([]);
    });
  });

  test('passes when catalog references existing paths and discovered tests', () => {
    return withWorkspace((rootDir) => {
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
      expect(report.warnings).toEqual([]);
    });
  });

  test('fails when catalog references missing paths', () => {
    return withWorkspace((rootDir) => {
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
      expect(report.warnings).toEqual([]);
    });
  });

  test('fails when discovered tests are not listed in the catalog', () => {
    return withWorkspace((rootDir) => {
      writeFile(rootDir, 'tests/catalog.md', '`tests/unit/a.test.ts`');
      writeFile(rootDir, 'tests/unit/a.test.ts', 'test("a", () => expect(true).toBe(true));');
      writeFile(
        rootDir,
        'tests/unit/forgotten.test.ts',
        'test("forgotten", () => expect(true).toBe(true));'
      );

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
      expect(report.warnings).toEqual([]);
    });
  });

  test('fails when cataloged test locations are not discovered by Jest patterns', () => {
    return withWorkspace((rootDir) => {
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
      expect(report.warnings).toEqual([]);
    });
  });

  test('uses Jest default discovery patterns when testMatch is omitted', () => {
    return withWorkspace((rootDir) => {
      writeFile(rootDir, 'tests/catalog.md', '`tests/unit/uses-default.spec.ts`');
      writeFile(
        rootDir,
        'tests/unit/uses-default.spec.ts',
        'test("default-pattern", () => expect(true).toBe(true));'
      );

      const report = validateTestCatalog({
        rootDir,
        catalogPath: path.join(rootDir, 'tests/catalog.md'),
        jestConfig: {
          testPathIgnorePatterns: [],
        },
      });

      expect(report.isValid).toBe(true);
      expect(report.discoveredTestFiles).toEqual(['tests/unit/uses-default.spec.ts']);
    });
  });

  test('collects warnings for invalid ignore patterns', () => {
    return withWorkspace((rootDir) => {
      writeFile(rootDir, 'tests/catalog.md', '`tests/unit/a.test.ts`');
      writeFile(rootDir, 'tests/unit/a.test.ts', 'test("a", () => expect(true).toBe(true));');

      const report = validateTestCatalog({
        rootDir,
        catalogPath: path.join(rootDir, 'tests/catalog.md'),
        jestConfig: {
          testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
          testPathIgnorePatterns: ['['],
        },
      });

      expect(report.isValid).toBe(true);
      expect(report.warnings).toHaveLength(1);
      expect(report.warnings[0]).toContain('Invalid Jest ignore pattern');
    });
  });

  test('compiles valid ignore patterns and reports invalid ones', () => {
    const invalidPatternWarnings = [];
    const patterns = compileIgnorePatterns(['[', '/tests/e2e/'], (pattern) => {
      invalidPatternWarnings.push(pattern);
    });

    expect(patterns).toHaveLength(1);
    expect(patterns[0].test('/tmp/tests/e2e/example.spec.ts')).toBe(true);
    expect(invalidPatternWarnings).toEqual(['[']);
  });

  test('rejects CLI paths that resolve outside the repository root', () => {
    expect(() =>
      resolvePathWithinRoot(path.resolve('/tmp/outside-catalog.md'), '/unused', 'Catalog path')
    ).toThrow('must resolve inside the repository');

    const resolved = resolvePathWithinRoot('tests/catalog.md', '/unused', 'Catalog path');
    expect(resolved.endsWith(path.join('tests', 'catalog.md'))).toBe(true);
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  test('does not flag cataloged tests that are intentionally ignored by Jest', () => {
    return withWorkspace((rootDir) => {
      writeFile(rootDir, 'tests/catalog.md', '`tests/e2e/ignored.spec.ts`');
      writeFile(rootDir, 'tests/e2e/ignored.spec.ts', 'test("ignored", () => expect(true).toBe(true));');

      const report = validateTestCatalog({
        rootDir,
        catalogPath: path.join(rootDir, 'tests/catalog.md'),
        jestConfig: {
          testMatch: ['<rootDir>/tests/**/*.{js,jsx,ts,tsx}'],
          testPathIgnorePatterns: ['/tests/e2e/'],
        },
      });

      expect(report.isValid).toBe(true);
      expect(report.listedButNotDiscoveredTestFiles).toEqual([]);
    });
  });
});
