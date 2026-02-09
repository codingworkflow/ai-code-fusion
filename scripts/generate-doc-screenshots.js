#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const CAPTURE_SCRIPT_PATH = path.join(__dirname, 'capture-ui-screenshot.js');
const TEMP_SCREENSHOT_DIR = path.join(ROOT_DIR, 'dist', 'docs', 'screenshots');
const DOCS_IMAGE_DIR = path.join(ROOT_DIR, 'docs', 'images');
const TEMP_BASE_NAME = 'docs-panels';

const screenshotMap = [
  { from: `${TEMP_BASE_NAME}.png`, to: 'app-config-panel.png' },
  { from: `${TEMP_BASE_NAME}-source.png`, to: 'app-select-panel.png' },
  { from: `${TEMP_BASE_NAME}-source-selected.png`, to: 'app-select-panel-selected.png' },
  { from: `${TEMP_BASE_NAME}-source-selected-resized.png`, to: 'app-select-panel-resized.png' },
  { from: `${TEMP_BASE_NAME}-processed.png`, to: 'app-processed-panel.png' },
];

function fail(message) {
  console.error(`Failed to generate docs screenshots: ${message}`);
  process.exit(1);
}

function runCaptureScript() {
  const captureEnv = {
    ...process.env,
    UI_SCREENSHOT_DIR: path.relative(ROOT_DIR, TEMP_SCREENSHOT_DIR),
    UI_SCREENSHOT_NAME: `${TEMP_BASE_NAME}.png`,
    UI_SCREENSHOT_PORT: process.env.UI_SCREENSHOT_PORT || '4174',
  };

  const result = spawnSync(process.execPath, [CAPTURE_SCRIPT_PATH], {
    cwd: ROOT_DIR,
    env: captureEnv,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(`capture script exited with code ${result.status}`);
  }
}

function copyScreenshotsToDocs() {
  fs.mkdirSync(DOCS_IMAGE_DIR, { recursive: true });

  for (const { from, to } of screenshotMap) {
    const sourcePath = path.join(TEMP_SCREENSHOT_DIR, from);
    const targetPath = path.join(DOCS_IMAGE_DIR, to);

    if (!fs.existsSync(sourcePath)) {
      fail(`missing screenshot ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Updated docs screenshot: ${targetPath}`);
  }
}

runCaptureScript();
copyScreenshotsToDocs();
