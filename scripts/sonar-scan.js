#!/usr/bin/env node
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sonarqubeScanner = require('sonarqube-scanner');

function redactUrlForLogs(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const portSegment = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//<redacted-host>${portSegment}`;
  } catch (_error) {
    return '<redacted-url>';
  }
}

function resolveNpmCliPath() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && path.isAbsolute(npmExecPath) && fs.existsSync(npmExecPath)) {
    return npmExecPath;
  }

  try {
    const resolvedNpmCliPath = require.resolve('npm/bin/npm-cli.js');
    if (path.isAbsolute(resolvedNpmCliPath) && fs.existsSync(resolvedNpmCliPath)) {
      return resolvedNpmCliPath;
    }
  } catch (_error) {
    // Keep fallback behavior below.
  }

  return null;
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0];
    const unquoted = value.slice(1, -1);
    if (quote === '"') {
      return unquoted
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    }
    return unquoted;
  }

  // Strip trailing comments for unquoted values.
  return value.replace(/\s+#.*$/, '').trim();
}

function shouldPreferDotenvValue(key, parsedValue, lockedEnvKeys) {
  if (!lockedEnvKeys.has(key)) {
    return true;
  }

  const isSonarVariable = key.startsWith('SONAR_');
  const isVaultVariable = key.startsWith('VAULT_');
  const isDtrackVariable = key.startsWith('DTRACK_') || key === 'DTR_PROJECT_KEY';
  const isEmptyTokenOverride = key === 'SONAR_TOKEN' && parsedValue === '';

  if (isEmptyTokenOverride) {
    return false;
  }

  return isSonarVariable || isVaultVariable || isDtrackVariable;
}

function shouldImportFromShell(key) {
  return (
    key.startsWith('SONAR_') ||
    key.startsWith('VAULT_') ||
    key.startsWith('DTRACK_') ||
    key === 'DTR_PROJECT_KEY'
  );
}

function loadEnvFile(filePath, lockedEnvKeys) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const loadedKeys = [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const normalizedLine = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;

    // Restrict to conventional env variable names.
    const match = normalizedLine.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const parsedValue = parseEnvValue(rawValue);
    if (!shouldPreferDotenvValue(key, parsedValue, lockedEnvKeys)) {
      continue;
    }

    process.env[key] = parsedValue;
    loadedKeys.push(key);
  }

  return loadedKeys;
}

function loadEnvViaBash(projectRoot, lockedEnvKeys) {
  if (!fs.existsSync(path.join(projectRoot, '.env'))) {
    return [];
  }

  const shellScript = `
if [ -f "./.env.vault" ]; then
  . ./.env.vault || true
fi
if [ -f "./.env" ]; then
  set -a
  . ./.env || true
  set +a
fi
env -0
`;

  const result = spawnSync('bash', ['-lc', shellScript], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
    env: process.env,
  });

  if (result.error && result.error.code === 'ENOENT') {
    return [];
  }

  if (result.error || result.status !== 0 || !result.stdout) {
    return [];
  }

  const loadedKeys = [];
  const entries = result.stdout.split('\0').filter(Boolean);
  for (const entry of entries) {
    const delimiterIndex = entry.indexOf('=');
    if (delimiterIndex <= 0) {
      continue;
    }

    const key = entry.slice(0, delimiterIndex);
    const value = entry.slice(delimiterIndex + 1);
    if (!shouldImportFromShell(key)) {
      continue;
    }

    if (!shouldPreferDotenvValue(key, value, lockedEnvKeys)) {
      continue;
    }

    process.env[key] = value;
    loadedKeys.push(key);
  }

  return loadedKeys;
}

const projectRoot = path.resolve(__dirname, '..');
const lockedEnvKeys = new Set(Object.keys(process.env));
const loadedEnvKeys = [];

const bashLoadedKeys = loadEnvViaBash(projectRoot, lockedEnvKeys);
loadedEnvKeys.push(...bashLoadedKeys);
if (bashLoadedKeys.length === 0) {
  loadedEnvKeys.push(...loadEnvFile(path.join(projectRoot, '.env'), lockedEnvKeys));
}
loadedEnvKeys.push(...loadEnvFile(path.join(projectRoot, '.env.local'), lockedEnvKeys));

if (loadedEnvKeys.length > 0) {
  const uniqueLoadedKeys = [...new Set(loadedEnvKeys)];
  console.log(`Loaded environment variables: ${uniqueLoadedKeys.join(', ')}`);
} else {
  console.log('No .env values loaded; using existing environment variables');
}

function runWithNativeScanner(scannerOptions) {
  const scannerBinary = resolveNativeScannerPath();
  if (!scannerBinary) {
    return false;
  }

  console.log(`Using native sonar-scanner: ${scannerBinary}`);
  const args = Object.entries(scannerOptions).map(([key, value]) => `-D${key}=${value}`);
  const useWindowsShell = process.platform === 'win32' && scannerBinary.toLowerCase().endsWith('.bat');
  const result = spawnSync(scannerBinary, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: useWindowsShell,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`sonar-scanner exited with status ${result.status}`);
  }

  return true;
}

function resolveNativeScannerPath() {
  const configuredPath = process.env.SONAR_SCANNER_PATH;
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }

  const locator = process.platform === 'win32' ? 'where' : 'which';
  const locatorResult = spawnSync(locator, ['sonar-scanner'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (locatorResult.status === 0) {
    const scannerPath = (locatorResult.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (scannerPath && fs.existsSync(scannerPath) && !isNpmScannerWrapperPath(scannerPath)) {
      return scannerPath;
    }
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    return null;
  }

  const sonarDir = path.join(homeDir, '.sonar');
  if (!fs.existsSync(sonarDir)) {
    return null;
  }

  const scannerDirs = fs
    .readdirSync(sonarDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('sonar-scanner-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const binaryName = process.platform === 'win32' ? 'sonar-scanner.bat' : 'sonar-scanner';
  for (const dirName of scannerDirs) {
    const candidate = path.join(sonarDir, dirName, 'bin', binaryName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isNpmScannerWrapperPath(scannerPath) {
  const normalizedPath = path.normalize(scannerPath).toLowerCase();
  const wrapperSuffix = path
    .join('node_modules', '.bin', process.platform === 'win32' ? 'sonar-scanner.cmd' : 'sonar-scanner')
    .toLowerCase();
  return normalizedPath.endsWith(wrapperSuffix);
}

// Check environment variables
const sonarToken = (process.env.SONAR_TOKEN || '').trim();
const sonarUrl = process.env.SONAR_URL || process.env.SONAR_HOST_URL || 'http://localhost:9000';

// Validate URL format
try {
  new URL(sonarUrl);
} catch (e) {
  console.error(`Error: SONAR_URL is not a valid URL: ${sonarUrl}`);
  process.exit(1);
}

console.log('Starting SonarQube scan...');
console.log(`SonarQube Server: ${redactUrlForLogs(sonarUrl)}`);
if (!sonarToken) {
  console.log('SONAR_TOKEN not set; attempting unauthenticated scan');
}

// Generate a fresh coverage report so Sonar never uses stale lcov data.
const shouldGenerateCoverage = process.env.SONAR_GENERATE_COVERAGE !== 'false';
const coveragePath = path.join(__dirname, '..', 'coverage', 'lcov.info');
if (shouldGenerateCoverage) {
  const coverageDir = path.join(__dirname, '..', 'coverage');
  fs.rmSync(coverageDir, { recursive: true, force: true });
  console.log('Generating fresh Jest coverage report for SonarQube...');
  try {
    const npmCliPath = resolveNpmCliPath();
    if (!npmCliPath) {
      console.error('Error: Unable to resolve npm CLI path for coverage generation.');
      process.exit(1);
    }

    execFileSync(process.execPath, [npmCliPath, 'test', '--', '--coverage', '--runInBand'], {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Error: Failed to generate coverage report for SonarQube.');
    process.exit(1);
  }
}

if (!fs.existsSync(coveragePath)) {
  console.error(`Error: Coverage report not found at ${coveragePath}`);
  process.exit(1);
}

// Read properties from sonar-project.properties
const propertiesPath = path.join(__dirname, '..', 'sonar-project.properties');
const propertiesContent = fs.readFileSync(propertiesPath, 'utf8');
const properties = {};

// Simple parser for properties file
propertiesContent.split('\n').forEach((line) => {
  line = line.trim();
  if (line && !line.startsWith('#')) {
    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) {
      return;
    }
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim();
    if (key && value) {
      properties[key] = value;
    }
  }
});

// Check if project key is provided in the environment
const projectKey =
  process.env.SONAR_PROJECT_KEY ||
  process.env.SONAR_PROJECT ||
  properties['sonar.projectKey'] ||
  'ai-code-prep';
const projectName = process.env.SONAR_PROJECT_NAME || properties['sonar.projectName'];
const projectVersion = process.env.SONAR_PROJECT_VERSION || properties['sonar.projectVersion'];

// Run SonarQube scan
console.log('Running SonarQube scan...');
console.log(`Project Key: ${projectKey}`);

try {
  const scannerOptions = {
    'sonar.projectKey': projectKey,
    'sonar.projectName': projectName || 'Repository AI Code Fusion',
    'sonar.projectVersion': projectVersion || '0.1.0',
    'sonar.sources': properties['sonar.sources'] || 'src',
    'sonar.exclusions':
      properties['sonar.exclusions'] ||
      'node_modules/**,dist/**,**/*.test.js,**/*.test.jsx,**/*.spec.js,**/*.spec.jsx,coverage/**',
    'sonar.tests': properties['sonar.tests'] || 'src/__tests__',
    'sonar.test.inclusions':
      properties['sonar.test.inclusions'] ||
      '**/*.test.js,**/*.test.jsx,**/*.spec.js,**/*.spec.jsx',
    'sonar.javascript.lcov.reportPaths':
      properties['sonar.javascript.lcov.reportPaths'] || 'coverage/lcov.info',
    'sonar.sourceEncoding': properties['sonar.sourceEncoding'] || 'UTF-8',
    'sonar.host.url': sonarUrl,
  };

  if (sonarToken) {
    scannerOptions['sonar.token'] = sonarToken;
  }

  if (runWithNativeScanner(scannerOptions)) {
    console.log('SonarQube scan completed successfully!');
    process.exit(0);
  }

  console.log('No native sonar-scanner found in PATH; falling back to npm scanner wrapper');

  const scannerConfig = {
    serverUrl: sonarUrl,
    options: scannerOptions,
  };

  if (sonarToken) {
    scannerConfig.token = sonarToken;
  }

  sonarqubeScanner(scannerConfig, (result) => {
    if (result) {
      console.error('SonarQube scan failed:', result);
      console.log('\nPossible authorization issues:');
      console.log('1. Make sure your SONAR_TOKEN has correct permissions on the SonarQube server');
      console.log(
        '2. Check if the project exists on the server or if you have permission to create it'
      );
      console.log(
        '3. Verify the token has not expired and is valid for the specified project key'
      );
      process.exit(1);
    } else {
      console.log('SonarQube scan completed successfully!');
    }
  });
} catch (error) {
  console.error('Error running SonarQube scan:', error.message);
  process.exit(1);
}
