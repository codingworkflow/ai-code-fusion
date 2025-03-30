/**
 * This script cleans development assets to ensure they're properly rebuilt.
 * It removes CSS output files and bundled JS files.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const rimraf = promisify(require('rimraf'));

// Asset paths relative to project root
const assetPaths = [
  'src/renderer/bundle.js',
  'src/renderer/bundle.js.map',
  'src/renderer/bundle.js.LICENSE.txt',
  'src/renderer/output.css',
];

async function cleanDevAssets() {
  console.log('🧹 Cleaning development assets...');

  for (const assetPath of assetPaths) {
    const fullPath = path.join(process.cwd(), assetPath);

    try {
      await rimraf(fullPath);
      console.log(`  ✓ Removed: ${assetPath}`);
    } catch (err) {
      // Ignore errors for files that don't exist
      if (err.code !== 'ENOENT') {
        console.error(`  ✗ Error removing ${assetPath}:`, err.message);
      }
    }
  }

  console.log('✅ Development assets cleaned successfully');
}

// Run the cleaning process
cleanDevAssets().catch((err) => {
  console.error('Error cleaning assets:', err);
  process.exit(1);
});
