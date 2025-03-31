# AI Code Fusion Scripts

This directory contains scripts for development, building, and releasing the AI Code Fusion application.

## Script Organization

- `index.js` - Main entry point for all scripts
- `lib/` - Reusable script modules
  - `build.js` - Build-related functions
  - `dev.js` - Development server functions
  - `release.js` - Release preparation functions
  - `utils.js` - Shared utility functions
- `prepare-release.js` - Standalone script for release preparation
- Various utility scripts for specific tasks

## Usage

The recommended way to run scripts is through the unified `index.js` entry point:

```bash
node scripts/index.js <command> [args...]
```

### Available Commands

#### Development

- `dev` or `start` - Start the development server
- `css` - Build CSS files
- `css:watch` - Watch and rebuild CSS files on changes

#### Building

- `build` - Build for the current platform
- `build-win` - Build for Windows
- `build-linux` - Build for Linux
- `build-mac` - Build for macOS (Intel)
- `build-mac-arm` - Build for macOS (Apple Silicon)
- `build-mac-universal` - Build for macOS (Universal)

#### Testing and Quality

- `test` - Run all tests
- `test:watch` - Watch and run tests on changes
- `lint` - Run linter
- `format` - Run code formatter
- `validate` - Run all validation (lint + test)
- `sonar` - Run SonarQube analysis

#### Release Management

- `release <version>` - Prepare a new release
  - `<version>` can be a specific version number or `patch`, `minor`, or `major`

#### Utility Commands

- `setup` or `init` - Setup project
- `clean` - Clean build artifacts
- `clean-all` - Clean all generated files (including node_modules)
- `icons` - Generate application icons

## Release Process

The release process is handled by the `release.js` module, which can be invoked in two ways:

```bash
# Using the unified entry point
node scripts/index.js release <version>

# Using the standalone script
node scripts/prepare-release.js <version>
```

The release preparation process:

1. Updates the version in `package.json`
2. Prompts for changelog entries and updates `CHANGELOG.md`
3. Creates a git commit with the changes
4. Creates a git tag for the release

After running the script, you need to manually push the changes and tag:

```bash
git push && git push origin v<version>
```

This will trigger the GitHub Actions workflow to build the application and create a release.
