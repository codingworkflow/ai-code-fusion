/**
 * Security and dependency automation commands.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const utils = require('./utils');

const SECURITY_DIR = path.join(utils.ROOT_DIR, 'dist', 'security');
const GITLEAKS_DIR = path.join(SECURITY_DIR, 'gitleaks');
const SBOM_DIR = path.join(SECURITY_DIR, 'sbom');
const RENOVATE_DIR = path.join(SECURITY_DIR, 'renovate');

function ensureSecurityDirs() {
  utils.ensureDir(SECURITY_DIR);
  utils.ensureDir(GITLEAKS_DIR);
  utils.ensureDir(SBOM_DIR);
  utils.ensureDir(RENOVATE_DIR);
}

function hasCommand(command) {
  const checkCommand = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;

  try {
    execSync(checkCommand, { stdio: 'ignore' });
    return true;
  } catch (_error) {
    return false;
  }
}

function getCommandCandidates(command) {
  if (process.platform === 'win32') {
    return [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command];
  }

  return [command];
}

function resolveCommand(command, localCandidates = []) {
  for (const candidate of getCommandCandidates(command)) {
    if (hasCommand(candidate)) {
      return candidate;
    }
  }

  for (const candidate of localCandidates) {
    const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(utils.ROOT_DIR, candidate);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

function runCommand(command, args = [], options = {}) {
  const sanitizedArgs = args.map((arg) => {
    if (/^--token=/.test(arg) || /^--\w*token=/.test(arg)) {
      const [key] = arg.split('=');
      return `${key}=***`;
    }
    return arg;
  });
  const commandLine = [command, ...sanitizedArgs].join(' ');
  console.log(`Running: ${commandLine}`);

  const result = spawnSync(command, args, {
    cwd: utils.ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env || {}) },
    shell: false,
  });

  if (result.error) {
    throw new Error(`Failed to start command '${command}': ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${commandLine}`);
  }

  return true;
}

function getNpxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function readPackageMetadata() {
  const packageJsonPath = path.join(utils.ROOT_DIR, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (_error) {
    return {};
  }
}

async function runGitleaks() {
  ensureSecurityDirs();

  const gitleaksPath = resolveCommand('gitleaks', [
    path.join('bin', 'gitleaks'),
    path.join('bin', 'gitleaks.exe'),
  ]);

  if (!gitleaksPath) {
    throw new Error('gitleaks not found in PATH or ./bin (install gitleaks first)');
  }

  const reportPath = path.join(GITLEAKS_DIR, 'gitleaks-report.json');

  runCommand(gitleaksPath, [
    'detect',
    '--source',
    '.',
    '--report-format',
    'json',
    '--report-path',
    reportPath,
  ]);

  console.log(`Gitleaks report written to: ${reportPath}`);
  return reportPath;
}

async function runSbom() {
  ensureSecurityDirs();

  const reportPath = path.join(SBOM_DIR, 'sbom.cyclonedx.json');
  const syftPath = resolveCommand('syft', [path.join('bin', 'syft'), path.join('bin', 'syft.exe')]);

  if (syftPath) {
    try {
      runCommand(syftPath, ['dir:.', '-o', `cyclonedx-json=${reportPath}`]);
      console.log(`SBOM generated with syft: ${reportPath}`);
      return reportPath;
    } catch (error) {
      console.warn(`syft failed, falling back to CycloneDX npm generator: ${error.message}`);
    }
  }

  const npxCommand = getNpxCommand();
  if (!hasCommand(npxCommand)) {
    throw new Error('npx is required for SBOM fallback but was not found');
  }

  runCommand(npxCommand, [
    '--yes',
    '@cyclonedx/cyclonedx-npm',
    '--ignore-npm-errors',
    '--package-lock-only',
    '--output-format',
    'JSON',
    '--output-file',
    reportPath,
  ]);

  console.log(`SBOM generated with cyclonedx-npm: ${reportPath}`);
  return reportPath;
}

function resolveTokenFromFile() {
  const tokenFile = process.env.RENOVATE_TOKEN_FILE;
  if (!tokenFile) {
    return '';
  }

  const tokenFilePath = path.isAbsolute(tokenFile) ? tokenFile : path.join(utils.ROOT_DIR, tokenFile);
  if (!fs.existsSync(tokenFilePath)) {
    return '';
  }

  try {
    return fs.readFileSync(tokenFilePath, 'utf8').trim();
  } catch (_error) {
    return '';
  }
}

function resolveTokenFromGhCli() {
  const ghPath = resolveCommand('gh');
  if (!ghPath) {
    return '';
  }

  const result = spawnSync(ghPath, ['auth', 'token'], {
    cwd: utils.ROOT_DIR,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0 || !result.stdout) {
    return '';
  }

  return result.stdout.trim();
}

function resolveRenovateToken() {
  if (process.env.RENOVATE_TOKEN) {
    return { token: process.env.RENOVATE_TOKEN, source: 'RENOVATE_TOKEN' };
  }

  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, source: 'GITHUB_TOKEN' };
  }

  if (process.env.GH_TOKEN) {
    return { token: process.env.GH_TOKEN, source: 'GH_TOKEN' };
  }

  if (process.env.GITHUB_COM_TOKEN) {
    return { token: process.env.GITHUB_COM_TOKEN, source: 'GITHUB_COM_TOKEN' };
  }

  const fileToken = resolveTokenFromFile();
  if (fileToken) {
    return { token: fileToken, source: 'RENOVATE_TOKEN_FILE' };
  }

  const ghToken = resolveTokenFromGhCli();
  if (ghToken) {
    return { token: ghToken, source: 'gh auth token' };
  }

  return { token: '', source: '' };
}

function detectRepoSlugFromGit() {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: utils.ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const match = remote.match(/(?:git@|https?:\/\/)[^/:]+[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
    return match ? match[1] : '';
  } catch (_error) {
    return '';
  }
}

function addTokenToRenovateEnv(token) {
  if (!token) {
    return {};
  }

  return {
    RENOVATE_TOKEN: token,
    GITHUB_TOKEN: token,
    GITHUB_COM_TOKEN: token,
    RENOVATE_GITHUB_COM_TOKEN: token,
  };
}

function splitEnvArgs(value) {
  if (!value) {
    return [];
  }

  return value.split(' ').filter(Boolean);
}

async function runRenovate(extraArgs = []) {
  const npxCommand = getNpxCommand();

  if (!hasCommand(npxCommand)) {
    throw new Error('npx not found; install Node.js and npm');
  }

  const { token, source } = resolveRenovateToken();
  if (!token) {
    throw new Error(
      'RENOVATE_TOKEN (or GITHUB_TOKEN/GH_TOKEN/RENOVATE_TOKEN_FILE, or authenticated gh CLI) is required for renovate target'
    );
  }
  console.log(`Using token source: ${source}`);

  const explicitRepo = extraArgs.find((arg) => !arg.startsWith('-'));
  const repoSlug = explicitRepo || process.env.RENOVATE_REPOSITORY || detectRepoSlugFromGit();
  if (!repoSlug) {
    throw new Error(
      'RENOVATE_REPOSITORY is required when git remote origin cannot be resolved (expected owner/repo)'
    );
  }

  const platform = process.env.RENOVATE_PLATFORM || 'github';
  const args = ['--yes', 'renovate', `--platform=${platform}`];

  if (process.env.RENOVATE_ENDPOINT) {
    args.push(`--endpoint=${process.env.RENOVATE_ENDPOINT}`);
  }

  if (process.env.RENOVATE_EXTRA_ARGS) {
    args.push(...splitEnvArgs(process.env.RENOVATE_EXTRA_ARGS));
  }

  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  if (!explicitRepo) {
    args.push(repoSlug);
  }

  runCommand(npxCommand, args, { env: addTokenToRenovateEnv(token) });
}

async function runRenovateLocal(extraArgs = []) {
  ensureSecurityDirs();

  const reportPath = path.join(RENOVATE_DIR, 'renovate-local-report.json');
  const npxCommand = getNpxCommand();

  if (!hasCommand(npxCommand)) {
    throw new Error('npx not found; install Node.js and npm');
  }

  const { token, source } = resolveRenovateToken();
  const env = addTokenToRenovateEnv(token);
  const args = [
    '--yes',
    'renovate',
    '--platform=local',
    '--dry-run=lookup',
    '--onboarding=false',
    '--require-config=optional',
    '--detect-host-rules-from-env=true',
    '--github-token-warn=false',
    '--report-type=file',
    `--report-path=${reportPath}`,
  ];

  if (token) {
    console.log(`Using token source: ${source}`);
  } else {
    console.warn(
      'No GitHub token found (RENOVATE_TOKEN/GITHUB_TOKEN/GH_TOKEN/RENOVATE_TOKEN_FILE/gh auth token); GitHub-hosted dependencies may be skipped'
    );
  }

  if (process.env.RENOVATE_EXTRA_ARGS) {
    args.push(...splitEnvArgs(process.env.RENOVATE_EXTRA_ARGS));
  }

  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  runCommand(npxCommand, args, { env });

  console.log(`Renovate local report written to: ${reportPath}`);
  return reportPath;
}

async function runMendScan() {
  const homeDir = os.homedir();
  const mendPath = resolveCommand('mend-scan', [
    path.join(homeDir, '.mend-unified-agent', 'bin', 'mend-scan'),
    path.join(homeDir, '.mend-unified-agent', 'bin', 'mend-scan.exe'),
  ]);

  if (!mendPath) {
    throw new Error(
      'mend-scan not found in PATH or ~/.mend-unified-agent/bin (install Mend Unified Agent first)'
    );
  }

  const pkg = readPackageMetadata();
  const project = process.env.MEND_PROJECT || process.env.BINARY_NAME || pkg.name || 'ai-code-fusion';
  const version = process.env.MEND_PROJECT_VERSION || process.env.VERSION || pkg.version || '0.0.0';

  runCommand(mendPath, ['scan', '--project', project, '--version', version]);
  console.log('Mend scan completed successfully');
}

async function runSecurity() {
  console.log('Running security checks: gitleaks + sbom');

  const failures = [];

  try {
    await runGitleaks();
  } catch (error) {
    failures.push(`gitleaks failed: ${error.message}`);
  }

  try {
    await runSbom();
  } catch (error) {
    failures.push(`sbom failed: ${error.message}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  console.log('Security checks completed successfully');
}

module.exports = {
  runGitleaks,
  runSbom,
  runRenovate,
  runRenovateLocal,
  runMendScan,
  runSecurity,
};
