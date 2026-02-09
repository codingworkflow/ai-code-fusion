#!/usr/bin/env node
/**
 * AI Code Fusion - Unified Script Runner
 *
 * This script provides a unified entry point for all build, dev, and utility scripts
 *
 * Usage:
 *   node scripts/index.js <command> [args...]
 *
 * Examples:
 *   node scripts/index.js dev        - Start dev environment
 *   node scripts/index.js build      - Build for current platform
 *   node scripts/index.js release    - Create a new release
 */

const path = require('path');
const { execSync } = require('child_process');

// Import script modules
const utils = require('./lib/utils');
const build = require('./lib/build');
const dev = require('./lib/dev');
const release = require('./lib/release');
const security = require('./lib/security');

// Get the command from first argument
const [command, ...args] = process.argv.slice(2);

// Execute the command
async function executeCommand() {
  if (!command) {
    utils.printHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      // Development commands
      case 'dev':
      case 'start':
        await dev.start();
        break;

      // Build commands
      case 'build':
        await build.forCurrentPlatform();
        break;

      case 'build:win':
      case 'build-win':
        await build.forPlatform('win');
        break;

      case 'build:linux':
      case 'build-linux':
        await build.forPlatform('linux');
        break;

      case 'build:mac':
      case 'build-mac':
        await build.forPlatform('mac');
        break;

      case 'build:mac-arm':
      case 'build-mac-arm':
        await build.forPlatform('mac-arm');
        break;

      case 'build:mac-universal':
      case 'build-mac-universal':
        await build.forPlatform('mac-universal');
        break;

      // Setup and init commands
      case 'setup':
      case 'init':
        await utils.setupProject();
        break;

      // Clean commands
      case 'clean':
        await utils.cleanBuildArtifacts();
        break;

      case 'clean-all':
      case 'clean:all':
        await utils.cleanAll();
        break;

      // CSS commands
      case 'css':
        await utils.runNpmScript('build:css');
        console.log('CSS built successfully');
        break;

      case 'css:watch':
      case 'css-watch':
        await utils.runNpmScript('watch:css');
        break;

      // Testing commands
      case 'test':
        await utils.runNpmScript('test');
        console.log('Tests completed successfully');
        break;

      case 'test:watch':
        await utils.runNpmScript('test:watch');
        break;

      // Code quality commands
      case 'lint':
        await utils.runNpmScript('lint');
        console.log('Linting completed successfully');
        break;

      case 'format':
        await utils.runNpmScript('format');
        console.log('Formatting completed successfully');
        break;

      case 'validate':
        console.log('Running all validations...');
        await utils.runNpmScript('lint');
        await utils.runNpmScript('test');
        console.log('All validations passed!');
        break;

      case 'qa':
        console.log('Running QA checks (lint + test + security)...');
        await utils.runNpmScript('lint');
        await utils.runNpmScript('test');
        await security.runSecurity();
        console.log('QA checks completed successfully');
        break;

      // Security automation commands
      case 'security':
        await security.runSecurity();
        break;

      case 'gitleaks':
        await security.runGitleaks();
        break;

      case 'gitleaks-staged':
      case 'gitleaks:staged':
        await security.runGitleaksStaged();
        break;

      case 'sbom':
        await security.runSbom();
        break;

      case 'renovate':
        await security.runRenovate(args);
        break;

      case 'renovate-local':
      case 'renovate:local':
        await security.runRenovateLocal(args);
        break;

      case 'mend-scan':
      case 'mend:scan':
        await security.runMendScan();
        break;

      // Asset management commands
      case 'icons':
        await build.generateIcons();
        break;

      // Release commands
      case 'release':
        if (args.length === 0) {
          console.error('Error: Version argument is required');
          console.error('Usage: node scripts/index.js release <version>');
          console.error('Example: node scripts/index.js release 1.0.0');
          console.error('or: node scripts/index.js release patch|minor|major');
          process.exit(1);
        }
        // Filter out any empty strings that might come from make passing arguments
        const versionArg = args.filter((arg) => arg.trim() !== '')[0];
        if (!versionArg) {
          console.error('Error: Version argument is required');
          console.error('Usage: node scripts/index.js release <version>');
          console.error('Example: node scripts/index.js release 1.0.0');
          console.error('or: node scripts/index.js release patch|minor|major');
          process.exit(1);
        }
        await release.prepare(versionArg);
        break;

      // Git hooks
      case 'setup-hooks':
      case 'hooks':
        await utils.setupHooks();
        break;

      // SonarQube analysis
      case 'sonar':
        await utils.runNpmScript('sonar');
        console.log('SonarQube analysis completed successfully');
        break;

      // Direct script execution for backward compatibility
      case 'run':
        if (args.length === 0) {
          console.error('Error: Script name is required');
          console.error('Usage: node scripts/index.js run <script-name> [args...]');
          process.exit(1);
        }

        const scriptPath = path.join(__dirname, `${args[0]}.js`);
        if (!utils.fileExists(scriptPath)) {
          console.error(`Error: Script not found: ${scriptPath}`);
          process.exit(1);
        }

        console.log(`Running script: ${args[0]}`);
        execSync(`node ${scriptPath} ${args.slice(1).join(' ')}`, {
          stdio: 'inherit',
          cwd: utils.ROOT_DIR,
        });
        break;

      default:
        console.error(`Error: Unknown command '${command}'`);
        utils.printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error executing command: ${error.message}`);
    process.exit(1);
  }
}

// Execute the command and handle errors
executeCommand().catch((error) => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});
