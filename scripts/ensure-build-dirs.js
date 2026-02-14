/**
 * Script to ensure build directories exist for renderer outputs and TypeScript builds.
 */
const fs = require('fs');
const path = require('path');

// Define build directory paths
const buildDir = path.resolve(__dirname, '../build');
const distDir = path.resolve(__dirname, '../dist');
const rendererOutputDir = path.resolve(distDir, 'renderer');

// Create directories if they don't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating directory: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Ensure all required directories exist
ensureDirectoryExists(buildDir);
ensureDirectoryExists(distDir);
ensureDirectoryExists(rendererOutputDir);

console.log('Build directories ready');
