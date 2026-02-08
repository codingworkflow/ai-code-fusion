/**
 * Build functions for the application
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const utils = require('./utils');

/**
 * Prepare the build environment for a specific platform
 * @param {string} platform - Platform to prepare for (win, linux, mac)
 */
async function preparePlatform(platform) {
  console.log(`Preparing build environment for ${platform}...`);

  try {
    execSync(`node ${path.join(utils.ROOT_DIR, 'scripts/prepare-build.js')} ${platform}`, {
      stdio: 'inherit',
      cwd: utils.ROOT_DIR,
    });
    return true;
  } catch (error) {
    console.error(`Build preparation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Generate application icons
 */
async function generateIcons() {
  console.log('Generating application icons...');

  try {
    // Ensure required directories exist
    const ASSETS_DIR = path.join(utils.ROOT_DIR, 'src/assets');
    const ICONS_GENERATED_DIR = path.join(ASSETS_DIR, 'icons');
    const BUILD_ICONS_DIR = path.join(utils.ROOT_DIR, 'build/icons');

    // Create directories if they don't exist
    utils.ensureDir(ASSETS_DIR);
    utils.ensureDir(ICONS_GENERATED_DIR);
    utils.ensureDir(BUILD_ICONS_DIR);

    // Check for logo.png
    const logoPath = path.join(ASSETS_DIR, 'logo.png');
    if (!fs.existsSync(logoPath)) {
      console.warn(`Warning: logo.png not found at ${logoPath}`);
      console.warn('Please add a 1024x1024 PNG logo file to this location');
    }

    // Generate icons
    execSync(`node ${path.join(utils.ROOT_DIR, 'scripts/generate-icons.js')}`, {
      stdio: 'inherit',
      cwd: utils.ROOT_DIR,
    });

    console.log('Icon generation completed successfully');
    return true;
  } catch (error) {
    console.error(`Icon generation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Build the application for a specific platform
 * @param {string} platform - Platform to build for (win, linux, mac, mac-arm, mac-universal)
 */
async function forPlatform(platform) {
  console.log(`Building for ${platform}...`);

  try {
    utils.runNpmScript('build:ts');

    // Build CSS and webpack first
    utils.runNpmScript('build:css');
    utils.runNpmScript('build:webpack');

    // Prepare platform-specific assets and config
    let platformArg = platform;
    if (platform === 'win') platformArg = 'windows';
    if (platform === 'mac' || platform === 'mac-arm' || platform === 'mac-universal')
      platformArg = 'mac';

    await preparePlatform(platformArg);

    // Special handling for Linux to avoid icon issues
    if (platform === 'linux') {
      // Check if we're in a CI environment, use npm script if we are
      if (process.env.CI) {
        utils.runNpmScript('build:linux');
      } else {
        // Use direct command to avoid recursion
        execSync('npx electron-builder --linux AppImage --publish=never --c.linux.icon=false', {
          stdio: 'inherit',
          cwd: utils.ROOT_DIR,
          env: { ...process.env, NODE_ENV: 'production' },
        });
      }
      console.log('Linux build completed successfully');
      return true;
    }

    // For other platforms
    let scriptName = 'build';
    let directCommand = 'npx electron-builder';

    if (platform === 'win') {
      scriptName = 'build:win';
      directCommand = 'npx electron-builder --win';
    } else if (platform === 'mac') {
      scriptName = 'build:mac';
      directCommand = 'npx electron-builder --mac';
    } else if (platform === 'mac-arm') {
      scriptName = 'build:mac-arm';
      directCommand = 'npx electron-builder --mac --arm64';
    } else if (platform === 'mac-universal') {
      scriptName = 'build:mac-universal';
      directCommand = 'npx electron-builder --mac --universal';
    }

    // Use npm script in CI environments, direct command otherwise
    if (process.env.CI) {
      utils.runNpmScript(scriptName);
    } else {
      execSync(directCommand, {
        stdio: 'inherit',
        cwd: utils.ROOT_DIR,
        env: { ...process.env, NODE_ENV: 'production' },
      });
    }
    console.log(`${platform} build completed successfully`);
    return true;
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    throw error;
  }
}

/**
 * Build for the current platform
 */
async function forCurrentPlatform() {
  let platform;

  if (process.platform === 'win32') {
    platform = 'win';
  } else if (process.platform === 'darwin') {
    // On macOS, auto-detect Intel vs ARM
    platform = process.arch === 'arm64' ? 'mac-arm' : 'mac';
  } else {
    platform = 'linux';
  }

  return forPlatform(platform);
}

module.exports = {
  preparePlatform,
  generateIcons,
  forPlatform,
  forCurrentPlatform,
};
