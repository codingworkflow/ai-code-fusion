/**
 * Utility functions for build scripts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Root directory of the project
const ROOT_DIR = path.join(__dirname, '../..');

// File/path utilities
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Command execution helpers
function runNpm(command, args = [], options = {}) {
  const fullCommand = `npm ${command}${args.length > 0 ? ' ' + args.join(' ') : ''}`;
  console.log(`Running: ${fullCommand}`);

  try {
    execSync(fullCommand, {
      stdio: 'inherit',
      cwd: ROOT_DIR,
      ...options,
    });
    return true;
  } catch (error) {
    console.error(`Error running 'npm ${command}': ${error.message}`);
    throw error;
  }
}

function runNpmScript(script, args = [], options = {}) {
  const command = `npm run ${script}${args.length > 0 ? ' -- ' + args.join(' ') : ''}`;
  console.log(`Running: ${command}`);

  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: ROOT_DIR,
      ...options,
    });
    return true;
  } catch (error) {
    console.error(`Error running '${script}': ${error.message}`);
    throw error;
  }
}

// Setup functions
async function setupProject() {
  console.log('Setting up the project...');

  try {
    // Install dependencies using lockfile when available
    if (fileExists(path.join(ROOT_DIR, 'package-lock.json'))) {
      runNpm('ci');
    } else {
      runNpm('install');
    }

    // Build CSS
    runNpmScript('build:css');

    // Setup hooks
    try {
      runNpmScript('prepare');
    } catch (error) {
      console.warn('Warning: Pre-commit hooks setup had issues, but continuing with setup');
    }

    console.log('Setup completed successfully');
    console.log('');
    console.log('You can now run "node scripts/index.js dev" to start the development server');
    return true;
  } catch (error) {
    console.error(`Setup failed: ${error.message}`);
    throw error;
  }
}

async function setupHooks() {
  console.log(`Setting up Git hooks for ${process.platform}...`);

  try {
    runNpmScript('prepare');
    console.log('Hooks setup completed successfully');
    return true;
  } catch (error) {
    console.warn('Warning: Hooks setup had issues');
    throw error;
  }
}

// Clean functions
async function cleanBuildArtifacts() {
  const pathsToRemove = [
    path.join(ROOT_DIR, 'dist'),
    path.join(ROOT_DIR, 'dist', 'renderer', 'bundle.js'),
    path.join(ROOT_DIR, 'dist', 'renderer', 'bundle.js.map'),
    path.join(ROOT_DIR, 'build', 'ts'),
    path.join(ROOT_DIR, 'dist', 'renderer', 'output.css'),
  ];

  console.log('Cleaning build artifacts...');

  for (const p of pathsToRemove) {
    if (fs.existsSync(p)) {
      console.log(`Removing: ${p}`);
      if (fs.lstatSync(p).isDirectory()) {
        fs.rmSync(p, { recursive: true, force: true });
      } else {
        fs.rmSync(p, { force: true });
      }
    }
  }

  console.log('Clean completed successfully');
  console.log('');
  console.log('NOTE: Run "node scripts/index.js css" before starting development');
  return true;
}

async function cleanAll() {
  // First clean build artifacts
  await cleanBuildArtifacts();

  console.log('Running comprehensive cleanup...');

  // Clean node_modules
  const nodeModules = path.join(ROOT_DIR, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    console.log('Removing node_modules...');
    fs.rmSync(nodeModules, { recursive: true, force: true });
  }

  // Additional paths to clean
  const additionalPaths = [
    path.join(ROOT_DIR, 'build'),
    path.join(ROOT_DIR, 'coverage'),
    path.join(ROOT_DIR, '.nyc_output'),
    path.join(ROOT_DIR, '.tmp'),
    path.join(ROOT_DIR, 'temp'),
  ];

  // Clean additional paths
  for (const p of additionalPaths) {
    if (fs.existsSync(p)) {
      console.log(`Removing: ${p}`);
      fs.rmSync(p, { recursive: true, force: true });
    }
  }

  // Clean logs and cache files
  const patterns = ['npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*'];

  for (const pattern of patterns) {
    const files = fs
      .readdirSync(ROOT_DIR)
      .filter((file) => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(file);
      })
      .map((file) => path.join(ROOT_DIR, file));

    for (const file of files) {
      console.log(`Removing: ${file}`);
      fs.rmSync(file, { force: true });
    }
  }

  // Clean npm cache
  try {
    console.log('Cleaning npm cache...');
    execSync('npm cache clean --force', { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (error) {
    console.error(`Warning: Failed to clean npm cache: ${error.message}`);
  }

  console.log('Comprehensive cleanup completed successfully');
  console.log('');
  console.log(
    'NOTE: Run "node scripts/index.js setup" to reinstall dependencies and rebuild the project'
  );
  return true;
}

// Help output
function printHelp() {
  console.log('AI Code Fusion - Build System');
  console.log('');
  console.log('Usage: node scripts/index.js <command> [args...]');
  console.log('');
  console.log('Development Commands:');
  console.log('  dev, start           - Start development server');
  console.log('');
  console.log('Build Commands:');
  console.log('  build                - Build for current platform');
  console.log('  build-win            - Build for Windows');
  console.log('  build-linux          - Build for Linux');
  console.log('  build-mac            - Build for macOS (Intel)');
  console.log('  build-mac-arm        - Build for macOS (Apple Silicon)');
  console.log('  build-mac-universal  - Build for macOS (Universal Binary)');
  console.log('');
  console.log('Setup & Maintenance:');
  console.log('  setup, init          - Setup the project, install dependencies');
  console.log('  clean                - Clean build outputs');
  console.log('  clean-all            - Full project cleanup');
  console.log('  hooks                - Setup Git hooks');
  console.log('');
  console.log('Asset Commands:');
  console.log('  css                  - Build CSS');
  console.log('  css-watch            - Watch CSS files for changes');
  console.log('  icons                - Generate application icons');
  console.log('');
  console.log('Testing & Quality:');
  console.log('  test                 - Run tests');
  console.log('  test:watch           - Run tests in watch mode');
  console.log('  test:stress          - Run stress benchmark tests');
  console.log('  stress:metrics       - Build stress benchmark summary + Prometheus payload');
  console.log('  prometheus:verify    - Verify pushed stress metrics in Prometheus');
  console.log('  perf-test            - Run stress tests, push metrics, and verify Prometheus');
  console.log('  lint                 - Run linter');
  console.log(
    '  lint:md             - Validate markdown links, image paths, and no decorative icons'
  );
  console.log('  format               - Format code');
  console.log('  validate             - Run all code quality checks');
  console.log('  qa                   - Run lint + tests + security checks');
  console.log('  docs-screenshots     - Refresh docs UI screenshots');
  console.log('  security             - Run security checks (gitleaks + sbom)');
  console.log('  gitleaks             - Run gitleaks secret scan');
  console.log('  sbom                 - Generate CycloneDX SBOM');
  console.log('  renovate             - Run Renovate against repository');
  console.log('  renovate-local       - Run Renovate local dry-run report');
  console.log('  mend-scan            - Run Mend Unified Agent scan');
  console.log('  sonar                - Run SonarQube analysis');
  console.log('');
  console.log('Release:');
  console.log('  release <version>    - Prepare a release (version, changelog, git tag)');
  console.log('');
  console.log('Other:');
  console.log('  run <script> [args]  - Run a specific script directly');
  console.log('');
}

module.exports = {
  ROOT_DIR,
  fileExists,
  ensureDir,
  runNpm,
  runNpmScript,
  setupProject,
  setupHooks,
  cleanBuildArtifacts,
  cleanAll,
  printHelp,
};
