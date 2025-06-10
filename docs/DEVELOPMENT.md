# Development Guide

This document provides detailed information for developers working on the AI Code Fusion project.

## Development Environment Setup

### Prerequisites

- Node.js (v14 or later)
- npm
- Git

### Platform-Specific Build Instructions

#### Windows

Use the included `make.bat` file for all build commands:

```cmd
make <command>
```

#### Linux/macOS

Use the included `Makefile`:

```bash
make <command>
```

### Common Make Commands

```bash
# Install dependencies and set up the project
make setup

# Start development server
make dev

# Build for current platform
make build

# Build for Windows
make build-win

# Build for Linux
make build-linux

# Build for Mac
make build-mac

# Run tests
make test

# Run tests in watch mode
make test-watch

# Run linter
make lint

# Format code
make format

# Run all code quality checks
make validate
```

### Manual Setup

If you prefer not to use the make commands:

```bash
# Install dependencies
npm install

# Build CSS
npm run build:css

# Start development server
npm run dev
```

## Troubleshooting

If you encounter issues with the development server:

1. Clean the build outputs and reinstall dependencies:

   ```bash
   make clean
   make fix-deps
   ```

2. Make sure the CSS is built before starting the dev server:

   ```bash
   npm run build:css
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

If you encounter any issues with tiktoken or minimatch, you may need to install them separately:

```bash
npm install tiktoken minimatch
```

## Testing

Tests are located in the `src/__tests__` directory. To add new tests:

1. Create a file with the `.test.js` or `.test.jsx` extension in the `src/__tests__` directory
2. Use Jest and React Testing Library for component tests
3. Run tests with `make test` or `npm run test`

```bash
# Run a specific test file
make test-file FILE=src/__tests__/token-counter.test.js
```

## Release Process

For project maintainers, follow these steps to create a new release:

1. Ensure all changes are committed to the main branch
2. Run the release preparation script using either method:

   ```bash
   # Using the scripts/index.js entry point (recommended)
   node scripts/index.js release <version>

   # OR using the direct script
   node scripts/prepare-release.js <version>
   ```

   Where `<version>` can be:

   - A specific version number (e.g., `1.0.0`)
   - `patch` - increment the patch version
   - `minor` - increment the minor version
   - `major` - increment the major version

3. Enter the changelog entries when prompted
4. Confirm git tag creation when prompted
5. Push the changes and tag to GitHub:

   ```bash
   git push && git push origin v<version>
   ```

6. The GitHub Actions workflow will automatically:
   - Build the application for Windows, macOS, and Linux
   - Create a GitHub Release
   - Upload the builds as release assets
7. Go to the GitHub releases page to review the draft release and publish it

## Project Structure

- `/src/main` - Electron main process code
- `/src/renderer` - React application for the renderer process
- `/src/utils` - Shared utilities
- `/src/assets` - Static assets
