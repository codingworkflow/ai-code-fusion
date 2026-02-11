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
const SONAR_PROPERTY_KEY_PATTERN = /^sonar\.[a-zA-Z0-9_.-]+$/;

function sanitizeSonarProperties(properties) {
  return Object.entries(properties || {}).reduce((accumulator, [key, value]) => {
    if (!SONAR_PROPERTY_KEY_PATTERN.test(key)) {
      return accumulator;
    }

    if (typeof value !== 'string') {
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
}

function buildScannerOptions({
  projectKey,
  projectName,
  projectVersion,
  properties = {},
  sonarUrl,
  sonarToken,
}) {
  const safeProperties = sanitizeSonarProperties(properties);
  const options = {
    ...safeProperties,
    'sonar.projectKey': projectKey,
    'sonar.projectName': projectName || safeProperties['sonar.projectName'] || DEFAULT_PROJECT_NAME,
    'sonar.projectVersion':
      projectVersion || safeProperties['sonar.projectVersion'] || DEFAULT_PROJECT_VERSION,
    'sonar.sources': safeProperties['sonar.sources'] || DEFAULT_SOURCES,
    'sonar.exclusions': safeProperties['sonar.exclusions'] || DEFAULT_EXCLUSIONS,
    'sonar.tests': safeProperties['sonar.tests'] || DEFAULT_TESTS,
    'sonar.test.inclusions': safeProperties['sonar.test.inclusions'] || DEFAULT_TEST_INCLUSIONS,
    'sonar.cpd.exclusions': safeProperties['sonar.cpd.exclusions'] || DEFAULT_CPD_EXCLUSIONS,
    'sonar.javascript.lcov.reportPaths':
      safeProperties['sonar.javascript.lcov.reportPaths'] || DEFAULT_LCOV_PATH,
    'sonar.sourceEncoding': safeProperties['sonar.sourceEncoding'] || DEFAULT_SOURCE_ENCODING,
    'sonar.host.url': sonarUrl,
  };

  if (sonarToken) {
    options['sonar.token'] = sonarToken;
  }

  return options;
}

module.exports = {
  buildScannerOptions,
  DEFAULT_CPD_EXCLUSIONS,
};
