const DEFAULT_PROJECT_NAME = 'Repository AI Code Fusion';
const DEFAULT_PROJECT_VERSION = '0.1.0';
const DEFAULT_SOURCES = 'src';
const DEFAULT_EXCLUSIONS =
  'node_modules/**,dist/**,coverage/**,tests/**,scripts/**,**/__tests__/**,**/*.test.js,**/*.test.jsx,**/*.test.ts,**/*.test.tsx,**/*.spec.js,**/*.spec.jsx,**/*.spec.ts,**/*.spec.tsx';
const DEFAULT_TESTS = 'src/__tests__,tests';
const DEFAULT_TEST_INCLUSIONS =
  'tests/**/*.test.{js,jsx,ts,tsx},tests/**/*.spec.{js,jsx,ts,tsx},tests/**/*.stress.test.{js,jsx,ts,tsx},src/**/__tests__/**/*.{js,jsx,ts,tsx},src/**/*.test.{js,jsx,ts,tsx},src/**/*.spec.{js,jsx,ts,tsx}';
const DEFAULT_CPD_EXCLUSIONS =
  'tests/**,src/**/__tests__/**,**/*.test.js,**/*.test.jsx,**/*.test.ts,**/*.test.tsx,**/*.spec.js,**/*.spec.jsx,**/*.spec.ts,**/*.spec.tsx,**/*.stress.test.js,**/*.stress.test.jsx,**/*.stress.test.ts,**/*.stress.test.tsx';
const DEFAULT_LCOV_PATH = 'coverage/lcov.info';
const DEFAULT_SOURCE_ENCODING = 'UTF-8';

function buildScannerOptions({
  projectKey,
  projectName,
  projectVersion,
  properties = {},
  sonarUrl,
  sonarToken,
}) {
  const options = {
    ...properties,
    'sonar.projectKey': projectKey,
    'sonar.projectName': projectName || properties['sonar.projectName'] || DEFAULT_PROJECT_NAME,
    'sonar.projectVersion':
      projectVersion || properties['sonar.projectVersion'] || DEFAULT_PROJECT_VERSION,
    'sonar.sources': properties['sonar.sources'] || DEFAULT_SOURCES,
    'sonar.exclusions': properties['sonar.exclusions'] || DEFAULT_EXCLUSIONS,
    'sonar.tests': properties['sonar.tests'] || DEFAULT_TESTS,
    'sonar.test.inclusions': properties['sonar.test.inclusions'] || DEFAULT_TEST_INCLUSIONS,
    'sonar.cpd.exclusions': properties['sonar.cpd.exclusions'] || DEFAULT_CPD_EXCLUSIONS,
    'sonar.javascript.lcov.reportPaths':
      properties['sonar.javascript.lcov.reportPaths'] || DEFAULT_LCOV_PATH,
    'sonar.sourceEncoding': properties['sonar.sourceEncoding'] || DEFAULT_SOURCE_ENCODING,
    'sonar.host.url': sonarUrl,
  };

  if (sonarToken) {
    options['sonar.token'] = sonarToken;
  }

  return options;
}

module.exports = {
  buildScannerOptions,
  __testUtils: {
    DEFAULT_CPD_EXCLUSIONS,
  },
};
