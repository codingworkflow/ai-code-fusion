#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { minimatch } = require('minimatch');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_CATALOG_PATH = path.join(ROOT_DIR, 'tests', 'catalog.md');
const DEFAULT_JEST_CONFIG_PATH = path.join(ROOT_DIR, 'jest.config.js');
const CATALOG_PATH_REFERENCE_PATTERN = /`(tests\/[^`\s]+)`/g;
const EXECUTABLE_TEST_FILE_PATTERN = /\.(test|spec)\.(js|jsx|ts|tsx)$/;

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function extractCatalogPathReferences(content) {
  const references = new Set();

  for (const match of content.matchAll(CATALOG_PATH_REFERENCE_PATTERN)) {
    references.add(toPosixPath(match[1]));
  }

  return Array.from(references).sort();
}

function collectFilesRecursively(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(absolutePath));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function loadJestConfig(jestConfigPath = DEFAULT_JEST_CONFIG_PATH) {
  const resolvedPath = path.resolve(jestConfigPath);
  delete require.cache[resolvedPath];
  const loaded = require(resolvedPath);
  return loaded && typeof loaded === 'object' ? loaded : {};
}

function normalizeTestMatchPatterns(testMatchPatterns = [], rootDir = ROOT_DIR) {
  return testMatchPatterns.map((pattern) =>
    toPosixPath(pattern).replace('<rootDir>/', '').replace('<rootDir>', '')
  );
}

function compileIgnorePatterns(patterns = []) {
  return patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function isIgnoredByJest(absoluteFilePath, ignorePatterns) {
  const normalizedAbsolutePath = toPosixPath(absoluteFilePath);
  return ignorePatterns.some((pattern) => pattern.test(normalizedAbsolutePath));
}

function isMatchedByJest(relativeFilePath, testMatchPatterns) {
  if (testMatchPatterns.length === 0) {
    return true;
  }

  return testMatchPatterns.some((pattern) => minimatch(relativeFilePath, pattern, { dot: true }));
}

function listExecutableTestFiles(rootDir = ROOT_DIR) {
  const testsRoot = path.join(rootDir, 'tests');
  const files = collectFilesRecursively(testsRoot);

  return files
    .map((absolutePath) => toPosixPath(path.relative(rootDir, absolutePath)))
    .filter((relativePath) => EXECUTABLE_TEST_FILE_PATTERN.test(relativePath))
    .sort();
}

function validateTestCatalog({
  rootDir = ROOT_DIR,
  catalogPath = DEFAULT_CATALOG_PATH,
  jestConfigPath = DEFAULT_JEST_CONFIG_PATH,
  jestConfig,
} = {}) {
  let catalogContent = '';
  const errors = [];

  try {
    catalogContent = fs.readFileSync(catalogPath, 'utf8');
  } catch (error) {
    return {
      isValid: false,
      errors: [`Unable to read test catalog at ${catalogPath}: ${error.message}`],
      catalogPathReferences: [],
      missingCatalogPaths: [],
      discoveredTestFiles: [],
      unlistedDiscoveredTestFiles: [],
      listedButNotDiscoveredTestFiles: [],
    };
  }

  const effectiveJestConfig = jestConfig || loadJestConfig(jestConfigPath);
  const testMatchPatterns = normalizeTestMatchPatterns(effectiveJestConfig.testMatch, rootDir);
  const ignorePatterns = compileIgnorePatterns(effectiveJestConfig.testPathIgnorePatterns);
  const catalogPathReferences = extractCatalogPathReferences(catalogContent);

  const missingCatalogPaths = catalogPathReferences
    .filter((relativePath) => !relativePath.includes('*'))
    .filter((relativePath) => !fs.existsSync(path.join(rootDir, relativePath)))
    .sort();

  const executableTestFiles = listExecutableTestFiles(rootDir);
  const discoveredTestFiles = executableTestFiles
    .filter((relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      return (
        !isIgnoredByJest(absolutePath, ignorePatterns) &&
        isMatchedByJest(relativePath, testMatchPatterns)
      );
    })
    .sort();

  const discoveredTestFileSet = new Set(discoveredTestFiles);
  const catalogReferenceSet = new Set(catalogPathReferences);

  const unlistedDiscoveredTestFiles = discoveredTestFiles
    .filter((relativePath) => !catalogReferenceSet.has(relativePath))
    .sort();

  const listedButNotDiscoveredTestFiles = catalogPathReferences
    .filter((relativePath) => EXECUTABLE_TEST_FILE_PATTERN.test(relativePath))
    .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)))
    .filter((relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      if (isIgnoredByJest(absolutePath, ignorePatterns)) {
        return false;
      }

      return !discoveredTestFileSet.has(relativePath);
    })
    .sort();

  if (missingCatalogPaths.length > 0) {
    errors.push(
      `Catalog references missing paths: ${missingCatalogPaths.map((item) => `\`${item}\``).join(', ')}`
    );
  }

  if (unlistedDiscoveredTestFiles.length > 0) {
    errors.push(
      `Discovered tests missing from catalog: ${unlistedDiscoveredTestFiles.map((item) => `\`${item}\``).join(', ')}`
    );
  }

  if (listedButNotDiscoveredTestFiles.length > 0) {
    errors.push(
      `Catalog lists tests not discovered by Jest: ${listedButNotDiscoveredTestFiles.map((item) => `\`${item}\``).join(', ')}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    catalogPathReferences,
    missingCatalogPaths,
    discoveredTestFiles,
    unlistedDiscoveredTestFiles,
    listedButNotDiscoveredTestFiles,
  };
}

function run() {
  const catalogArg = process.argv[2];
  const jestConfigArg = process.argv[3];
  const result = validateTestCatalog({
    catalogPath: catalogArg ? path.resolve(process.cwd(), catalogArg) : DEFAULT_CATALOG_PATH,
    jestConfigPath: jestConfigArg
      ? path.resolve(process.cwd(), jestConfigArg)
      : DEFAULT_JEST_CONFIG_PATH,
  });

  if (!result.isValid) {
    console.error('Test catalog validation failed:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Test catalog validation passed (${result.catalogPathReferences.length} references, ${result.discoveredTestFiles.length} discovered tests).`
  );
}

if (require.main === module) {
  run();
}

module.exports = {
  CATALOG_PATH_REFERENCE_PATTERN,
  EXECUTABLE_TEST_FILE_PATTERN,
  extractCatalogPathReferences,
  isMatchedByJest,
  listExecutableTestFiles,
  normalizeTestMatchPatterns,
  validateTestCatalog,
};
