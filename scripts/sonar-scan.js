#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sonarqubeScanner = require('sonarqube-scanner');

// Load environment variables from .env file
const dotenvPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) {
  console.log('Loading environment variables from .env file');
  const envConfig = fs
    .readFileSync(dotenvPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, value] = line.split('=').map((part) => part.trim());
      if (key && value) {
        acc[key] = value;
        // Also set in process.env if not already set
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      return acc;
    }, {});

  console.log('Loaded environment variables:', Object.keys(envConfig).join(', '));
} else {
  console.log('No .env file found, using existing environment variables');
}

// Check environment variables
const sonarToken = process.env.SONAR_TOKEN;
const sonarUrl = process.env.SONAR_URL;

if (!sonarToken) {
  console.error('Error: SONAR_TOKEN environment variable is required');
  process.exit(1);
}

if (!sonarUrl) {
  console.error('Error: SONAR_URL environment variable is required');
  process.exit(1);
}

// Validate URL format
try {
  new URL(sonarUrl);
} catch (e) {
  console.error(`Error: SONAR_URL is not a valid URL: ${sonarUrl}`);
  process.exit(1);
}

console.log('Starting SonarQube scan...');
console.log(`SonarQube Server: ${sonarUrl}`);

// Run code coverage if it doesn't exist yet
const coveragePath = path.join(__dirname, '..', 'coverage', 'lcov.info');
if (!fs.existsSync(coveragePath)) {
  console.log('No coverage data found. Running tests with coverage...');
  try {
    execSync('npm test -- --coverage', { stdio: 'inherit' });
  } catch (error) {
    console.warn('Warning: Test coverage generation had issues, but continuing with scan.');
  }
}

// Read properties from sonar-project.properties
const propertiesPath = path.join(__dirname, '..', 'sonar-project.properties');
const propertiesContent = fs.readFileSync(propertiesPath, 'utf8');
const properties = {};

// Simple parser for properties file
propertiesContent.split('\n').forEach((line) => {
  line = line.trim();
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=').map((part) => part.trim());
    if (key && value) {
      properties[key] = value;
    }
  }
});

// Check if project key is provided in the environment
const projectKey =
  process.env.SONAR_PROJECT_KEY || properties['sonar.projectKey'] || 'ai-code-prep';

// Run SonarQube scan
console.log('Running SonarQube scan...');
console.log(`Project Key: ${projectKey}`);

try {
  sonarqubeScanner(
    {
      serverUrl: sonarUrl,
      token: sonarToken,
      options: {
        'sonar.projectKey': projectKey,
        'sonar.projectName': properties['sonar.projectName'] || 'Repository AI Code Fusion',
        'sonar.projectVersion': properties['sonar.projectVersion'] || '0.1.0',
        'sonar.sources': properties['sonar.sources'] || 'src',
        'sonar.exclusions':
          properties['sonar.exclusions'] ||
          'node_modules/**,dist/**,**/*.test.js,**/*.test.jsx,**/*.spec.js,**/*.spec.jsx,coverage/**',
        'sonar.tests': properties['sonar.tests'] || 'src/__tests__',
        'sonar.test.inclusions':
          properties['sonar.test.inclusions'] ||
          '**/*.test.js,**/*.test.jsx,**/*.spec.js,**/*.spec.jsx',
        'sonar.javascript.lcov.reportPaths':
          properties['sonar.javascript.lcov.reportPaths'] || 'coverage/lcov.info',
        'sonar.sourceEncoding': properties['sonar.sourceEncoding'] || 'UTF-8',
      },
    },
    (result) => {
      if (result) {
        console.error('SonarQube scan failed:', result);
        console.log('\nPossible authorization issues:');
        console.log(
          '1. Make sure your SONAR_TOKEN has correct permissions on the SonarQube server'
        );
        console.log(
          '2. Check if the project exists on the server or if you have permission to create it'
        );
        console.log(
          '3. Verify the token has not expired and is valid for the specified project key'
        );
        process.exit(1);
      } else {
        console.log('SonarQube scan completed successfully!');
      }
    }
  );
} catch (error) {
  console.error('Error running SonarQube scan:', error.message);
  process.exit(1);
}
