/**
 * Development environment functions
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const utils = require('./utils');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

// Format log messages
const log = (message, color = colors.reset) => {
  console.log(`${color}[dev] ${message}${colors.reset}`);
};

/**
 * Start the development environment
 */
async function start() {
  log('Starting development environment...', colors.green);

  try {
    // Build CSS if it doesn't exist
    const cssFile = path.join(utils.ROOT_DIR, 'src', 'renderer', 'output.css');
    if (!fs.existsSync(cssFile)) {
      log('CSS not found, building...', colors.yellow);
      try {
        // Try direct command execution first
        const { execSync } = require('child_process');
        log('Running tailwindcss directly...', colors.blue);
        execSync('npx tailwindcss -i ./src/renderer/styles.css -o ./src/renderer/output.css', {
          stdio: 'inherit',
          cwd: utils.ROOT_DIR,
        });
      } catch (err) {
        log(`Error running tailwindcss: ${err.message}`, colors.red);
        throw err;
      }
    }

    // Check if webpack output exists
    const webpackOutput = path.join(utils.ROOT_DIR, 'src', 'renderer', 'bundle.js');
    if (!fs.existsSync(webpackOutput)) {
      log('Webpack bundle not found, building...', colors.yellow);
      utils.runNpmScript('build:webpack');
    }

    // Start the dev server using concurrently to run all necessary processes
    log('Starting development server...', colors.blue);

    // Use concurrently directly to run all the required processes
    // Simplified approach without inline environment variable assignments

    // Use direct shell command to ensure proper argument parsing
    // This mimics exactly how make.bat does it successfully
    const concurrently = spawn(
      'npx concurrently --kill-others "npm run watch:css" "npm run watch:webpack" "cross-env NODE_ENV=development electron ."',
      [],
      {
        stdio: 'inherit',
        shell: true,
        cwd: utils.ROOT_DIR,
        env: {
          ...process.env,
          // Explicitly set NODE_ENV - this is the proper way to set environment variables on all platforms
          NODE_ENV: 'development',
        },
      }
    );

    // Improved error handling
    concurrently.on('error', (error) => {
      log(`Concurrently process error: ${error.message}`, colors.red);
      log(
        'This may be due to missing dependencies. Try running "npm install" first.',
        colors.yellow
      );
    });

    // Handle process exit with better error messaging
    concurrently.on('close', (code) => {
      if (code !== 0) {
        log(`Development process exited with code ${code}`, colors.red);
        log('Check the error messages above for more details.', colors.yellow);
        log('Common issues:', colors.yellow);
        log('1. Conflicting file locks - Try closing other instances first', colors.yellow);
        log('2. Missing dependencies - Run "npm install"', colors.yellow);
        log('3. Port conflicts - Check if another app is using the required ports', colors.yellow);
        process.exit(code);
      }
    });

    // Forward process signals
    process.on('SIGINT', () => concurrently.kill('SIGINT'));
    process.on('SIGTERM', () => concurrently.kill('SIGTERM'));

    return true;
  } catch (error) {
    log(`Development server failed to start: ${error.message}`, colors.red);
    throw error;
  }
}

module.exports = {
  start,
};
