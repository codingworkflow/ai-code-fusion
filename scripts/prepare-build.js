#!/usr/bin/env node
/**
 * Unified build preparation script
 *
 * This script prepares the project for building on all supported platforms:
 * - Windows
 * - Linux
 * - macOS
 *
 * Usage:
 *   node scripts/prepare-build.js [platform]
 *
 * Where platform is one of:
 *   - windows
 *   - linux
 *   - mac (or macos)
 *   - all (default)
 */

const fs = require('fs');
const path = require('path');

// Root directory of the project
const ROOT_DIR = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'src', 'assets');
const BUILD_ICONS_DIR = path.join(ROOT_DIR, 'build', 'icons');

// Ensure a directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Copy icons from assets/icons to their required locations based on platform
function setupIcons(platform) {
  console.log('Setting up application icons...');

  // Source directory
  const SOURCE_ICONS_DIR = path.join(ASSETS_DIR, 'icons');

  // Create a record of which icons were successfully set up
  const iconsSetup = {
    windows: false,
    macos: false,
    linux: false,
  };

  // Setup Windows icon if building for Windows
  if (platform === 'all' || platform === 'win' || platform === 'windows') {
    const winIconDest = path.join(ASSETS_DIR, 'icon.ico');

    // Check if icon already exists in the destination
    if (fs.existsSync(winIconDest)) {
      console.log(`✓ Windows icon already exists at: ${winIconDest}`);
      iconsSetup.windows = true;
    }
    // Copy from source/icons/win if it exists
    else if (fs.existsSync(path.join(SOURCE_ICONS_DIR, 'win/icon.ico'))) {
      ensureDir(path.dirname(winIconDest));
      fs.copyFileSync(path.join(SOURCE_ICONS_DIR, 'win/icon.ico'), winIconDest);
      console.log(`✓ Windows icon copied to: ${winIconDest}`);
      iconsSetup.windows = true;
    }
  }

  // Setup macOS icon if building for macOS
  if (platform === 'all' || platform === 'mac' || platform === 'macos') {
    const macIconDest = path.join(ASSETS_DIR, 'icon.icns');

    // Check if icon already exists in the destination
    if (fs.existsSync(macIconDest)) {
      console.log(`✓ macOS icon already exists at: ${macIconDest}`);
      iconsSetup.macos = true;
    }
    // Copy from source/icons/mac if it exists
    else if (fs.existsSync(path.join(SOURCE_ICONS_DIR, 'mac/icon.icns'))) {
      ensureDir(path.dirname(macIconDest));
      fs.copyFileSync(path.join(SOURCE_ICONS_DIR, 'mac/icon.icns'), macIconDest);
      console.log(`✓ macOS icon copied to: ${macIconDest}`);
      iconsSetup.macos = true;
    }
  }

  // Setup Linux icons if building for Linux
  if (platform === 'all' || platform === 'linux') {
    const linuxIconDest = path.join(BUILD_ICONS_DIR, 'icon.png');

    // Check if icon already exists in the destination
    if (fs.existsSync(linuxIconDest)) {
      console.log(`✓ Linux icon already exists at: ${linuxIconDest}`);
      iconsSetup.linux = true;
    }
    // Copy PNG files from source/icons/png if they exist
    else if (fs.existsSync(path.join(SOURCE_ICONS_DIR, 'png'))) {
      const pngDir = path.join(SOURCE_ICONS_DIR, 'png');
      const pngFiles = fs.readdirSync(pngDir).filter((file) => file.endsWith('.png'));

      if (pngFiles.length > 0) {
        ensureDir(BUILD_ICONS_DIR);

        // Copy all PNG files
        pngFiles.forEach((file) => {
          fs.copyFileSync(path.join(pngDir, file), path.join(BUILD_ICONS_DIR, file));
        });

        // Copy 512x512 as icon.png (main icon) if it exists
        if (fs.existsSync(path.join(pngDir, '512x512.png'))) {
          fs.copyFileSync(path.join(pngDir, '512x512.png'), linuxIconDest);
        }

        console.log(`✓ Linux icons copied to: ${BUILD_ICONS_DIR}`);
        iconsSetup.linux = true;
      }
    }
  }

  // Check if any required icons are missing
  const missingIcons = [];

  if ((platform === 'all' || platform === 'win' || platform === 'windows') && !iconsSetup.windows) {
    missingIcons.push(`Windows icon (${path.join(ASSETS_DIR, 'icon.ico')})`);
  }

  if ((platform === 'all' || platform === 'mac' || platform === 'macos') && !iconsSetup.macos) {
    missingIcons.push(`macOS icon (${path.join(ASSETS_DIR, 'icon.icns')})`);
  }

  if ((platform === 'all' || platform === 'linux') && !iconsSetup.linux) {
    missingIcons.push(`Linux icon (${path.join(BUILD_ICONS_DIR, 'icon.png')})`);
  }

  if (missingIcons.length > 0) {
    console.error('\nError: The following application icons could not be found:');
    missingIcons.forEach((icon) => console.error(`  • ${icon}`));
    console.error('\nExpected icon locations:');
    console.error(
      `  • Windows: ${path.join(ASSETS_DIR, 'icon.ico')} or ${path.join(
        SOURCE_ICONS_DIR,
        'win/icon.ico'
      )}`
    );
    console.error(
      `  • macOS: ${path.join(ASSETS_DIR, 'icon.icns')} or ${path.join(
        SOURCE_ICONS_DIR,
        'mac/icon.icns'
      )}`
    );
    console.error(
      `  • Linux: ${path.join(BUILD_ICONS_DIR, 'icon.png')} or PNG files in ${path.join(
        SOURCE_ICONS_DIR,
        'png'
      )}`
    );
    console.error('\nPlease ensure the icons exist at one of these locations or run:');
    console.error('  make icons');
    process.exit(1);
  }

  console.log('✓ All required application icons present and ready for build.');
  return true;
}

// Prepare for Windows build
function prepareWindows() {
  console.log('Preparing for Windows build...');

  // Setup icons
  setupIcons('windows');

  // Ensure package.json has Windows configuration
  updatePackageJson({
    win: {
      target: ['nsis'],
      icon: 'src/assets/icon.ico',
    },
  });

  console.log('Windows build preparation complete');
}

// Prepare for Linux build
function prepareLinux() {
  console.log('Preparing for Linux build...');

  // Setup icons
  setupIcons('linux');

  // Ensure the build/icons directory exists
  ensureDir(BUILD_ICONS_DIR);

  // Update package.json for Linux build
  updatePackageJson({
    linux: {
      target: ['AppImage'],
      category: 'Utility',
      artifactName: '${productName}-${version}.${ext}',
      icon: 'build/icons',
    },
  });

  console.log('Linux build preparation complete');
}

// Prepare for macOS build
function prepareMac() {
  console.log('Preparing for macOS build...');

  // Setup icons
  setupIcons('macos');

  // Ensure package.json has macOS configuration
  updatePackageJson({
    mac: {
      target: ['dmg', 'zip'],
      icon: 'src/assets/icon.icns',
      category: 'public.app-category.utilities',
    },
  });

  // Ensure build:mac-universal script exists
  ensureBuildScript(
    'build:mac-universal',
    'cross-env NODE_ENV=production electron-builder --mac --universal'
  );

  console.log('macOS build preparation complete');
}

// Update package.json build configuration
function updatePackageJson(platformConfig) {
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const packageJson = require(packageJsonPath);

  // Ensure build field exists
  if (!packageJson.build) {
    packageJson.build = {};
  }

  // Update with platform-specific config
  Object.entries(platformConfig).forEach(([platform, config]) => {
    packageJson.build[platform] = { ...packageJson.build[platform], ...config };
  });

  // Write back to package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

  console.log('Updated package.json build configuration');
}

// Ensure a build script exists in package.json
function ensureBuildScript(scriptName, scriptCommand) {
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  const packageJson = require(packageJsonPath);

  // Ensure scripts field exists
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  // Add the script if it doesn't exist
  if (!packageJson.scripts[scriptName]) {
    packageJson.scripts[scriptName] = scriptCommand;

    // Write back to package.json
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    console.log(`Added ${scriptName} script to package.json`);
  }
}

// Main function
function main() {
  const platform = process.argv[2] || 'all';

  // Ensure assets directory exists
  ensureDir(ASSETS_DIR);
  ensureDir(BUILD_ICONS_DIR);

  // We no longer need to check for logo.png here, as we've already generated the icons
  // and we're checking for their existence in checkIcons()

  switch (platform.toLowerCase()) {
    case 'windows':
    case 'win':
      prepareWindows();
      break;

    case 'linux':
      prepareLinux();
      break;

    case 'mac':
    case 'macos':
      prepareMac();
      break;

    case 'all':
      prepareWindows();
      prepareLinux();
      prepareMac();
      break;

    default:
      console.error(`Unknown platform: ${platform}`);
      console.log('Usage: node scripts/prepare-build.js [platform]');
      console.log('Where platform is: windows, linux, mac, or all');
      process.exit(1);
  }
}

// Run the main function
main();
