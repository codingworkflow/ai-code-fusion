/**
 * Release preparation functions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const utils = require('./utils');

// Paths
const PACKAGE_JSON_PATH = path.join(utils.ROOT_DIR, 'package.json');
const CHANGELOG_PATH = path.join(utils.ROOT_DIR, 'CHANGELOG.md');

/**
 * Update package.json version
 * @param {string} version - Version string or 'patch', 'minor', 'major'
 * @returns {string} The actual version that was set
 */
function updatePackageVersion(version) {
  console.log(`Updating package.json version to ${version}...`);

  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

  // If using semver keywords, calculate the new version
  if (['patch', 'minor', 'major'].includes(version)) {
    const currentVersion = packageJson.version;
    const [major, minor, patch] = currentVersion.split('.').map((v) => parseInt(v, 10));

    let newVersion;
    if (version === 'patch') {
      newVersion = `${major}.${minor}.${patch + 1}`;
    } else if (version === 'minor') {
      newVersion = `${major}.${minor + 1}.0`;
    } else if (version === 'major') {
      newVersion = `${major + 1}.0.0`;
    }

    console.log(`Incrementing ${version} version: ${currentVersion} → ${newVersion}`);
    version = newVersion;
  }

  // Update package.json
  packageJson.version = version;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2) + '\n');

  return version;
}

/**
 * Update CHANGELOG.md with new release entries
 * @param {string} version - Version string
 * @returns {Promise<void>}
 */
function updateChangelog(version) {
  return new Promise((resolve) => {
    console.log('\nPlease enter the changelog entries for this release.');
    console.log('Enter a blank line when done.\n');

    // Create a readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const entries = [];

    function promptForEntry() {
      rl.question('Entry: ', (entry) => {
        if (entry.trim() === '') {
          // Done entering entries
          let changelogContent;

          // Create the file if it doesn't exist
          if (!fs.existsSync(CHANGELOG_PATH)) {
            console.log('Creating new CHANGELOG.md file...');
            changelogContent =
              '# Changelog\n\nAll notable changes to this project will be documented in this file.\n';
          } else {
            changelogContent = fs.readFileSync(CHANGELOG_PATH, 'utf8');
          }

          const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

          const formattedEntries =
            entries.length > 0
              ? entries.map((entry) => `- ${entry}`).join('\n')
              : '- No changelog details were provided.';

          // Format the new entry with [v] prefix for GitHub release automation
          const newEntry = `\n## [v${version}] - ${date}\n\n### Added\n\n${formattedEntries}\n`;

          // Insert after "All notable changes" line if present, or after the first line
          const updatedChangelog = changelogContent.includes('All notable changes')
            ? changelogContent.replace(
                /All notable changes to this project will be documented in this file.\n/,
                `All notable changes to this project will be documented in this file.\n${newEntry}`
              )
            : changelogContent.replace(/# Changelog\n/, `# Changelog\n${newEntry}`);

          fs.writeFileSync(CHANGELOG_PATH, updatedChangelog);
          console.log(`\nChangelog updated for version ${version}`);

          rl.close();
          resolve();
        } else {
          entries.push(entry);
          promptForEntry();
        }
      });
    }

    promptForEntry();
  });
}

/**
 * Create a git tag for the release
 * @param {string} version - Version string
 * @returns {Promise<void>}
 */
function createGitTag(version) {
  return new Promise((resolve) => {
    // Create a readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`\nCreate git tag v${version}? (y/n): `, (answer) => {
      if (answer.toLowerCase() === 'y') {
        try {
          // Add package.json and CHANGELOG.md
          execSync('git add package.json CHANGELOG.md', { stdio: 'inherit', cwd: utils.ROOT_DIR });

          // Commit the changes
          execSync(`git commit -m "Release v${version}"`, {
            stdio: 'inherit',
            cwd: utils.ROOT_DIR,
          });

          // Create the tag
          execSync(`git tag -a v${version} -m "Version ${version}"`, {
            stdio: 'inherit',
            cwd: utils.ROOT_DIR,
          });

          console.log(`\nGit tag v${version} created. To push the tag, run:`);
          console.log(`git push && git push origin v${version}`);
        } catch (error) {
          console.error(`\nError creating git tag: ${error.message}`);
        }
      } else {
        console.log('\nSkipping git tag creation.');
      }

      rl.close();
      resolve();
    });
  });
}

/**
 * Prepare a new release
 * @param {string} version - Version string or 'patch', 'minor', 'major'
 */
async function prepare(version) {
  try {
    console.log('Preparing release...');

    // Update package.json version
    const finalVersion = updatePackageVersion(version);

    // Update changelog
    await updateChangelog(finalVersion);

    // Create git tag
    await createGitTag(finalVersion);

    console.log('\nRelease preparation complete!');
    return true;
  } catch (error) {
    console.error(`\nError preparing release: ${error.message}`);
    throw error;
  }
}

module.exports = {
  updatePackageVersion,
  updateChangelog,
  createGitTag,
  prepare,
};
