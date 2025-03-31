#!/usr/bin/env node
/**
 * Prepare Release Script
 *
 * This script is a convenience wrapper that calls the release module
 * to prepare a new release by updating the version, changelog, and creating a git tag.
 *
 * Usage:
 *   node scripts/prepare-release.js <version>
 *
 * Arguments:
 *   <version> - Can be a specific version number (e.g. '1.0.0') or 'patch', 'minor', or 'major'
 *
 * Example:
 *   node scripts/prepare-release.js patch     # Increments patch version
 *   node scripts/prepare-release.js minor     # Increments minor version
 *   node scripts/prepare-release.js major     # Increments major version
 *   node scripts/prepare-release.js 1.2.3     # Sets version to 1.2.3
 */

const release = require('./lib/release');

async function main() {
  // Get version from arguments
  const version = process.argv[2];

  if (!version) {
    console.error('Error: Version argument is required');
    console.error('Usage: node scripts/prepare-release.js <version>');
    console.error('Example: node scripts/prepare-release.js 1.0.0');
    console.error('or: node scripts/prepare-release.js patch|minor|major');
    process.exit(1);
  }

  try {
    // Call the release prepare function
    await release.prepare(version);
  } catch (error) {
    console.error(`Error preparing release: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});
