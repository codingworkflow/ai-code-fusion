/**
 * Script to ensure build directories exist for webpack
 */
const fs = require('fs');
const path = require('path');

// Define build directory paths
const buildDir = path.resolve(__dirname, '../build');
const rendererDir = path.resolve(buildDir, 'renderer');

// Create directories if they don't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Ensure all required directories exist
ensureDirectoryExists(buildDir);
ensureDirectoryExists(rendererDir);

console.log('Build directories ready');
