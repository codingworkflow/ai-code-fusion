#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.join(__dirname, '..');
const RENDERER_DIR = path.join(ROOT_DIR, 'src', 'renderer');
const SCREENSHOT_DIR = path.join(ROOT_DIR, 'dist', 'qa', 'screenshots');
const SCREENSHOT_NAME =
  process.env.UI_SCREENSHOT_NAME || `ui-${process.platform}-${process.arch}.png`;
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, SCREENSHOT_NAME);
const PORT = Number(process.env.UI_SCREENSHOT_PORT || 4173);

const MIME_TYPES = {
  '.css': 'text/css; charset=UTF-8',
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function resolveFilePath(requestUrl) {
  const urlPath = decodeURIComponent(requestUrl.split('?')[0]);
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const absolutePath = path.resolve(RENDERER_DIR, relativePath);
  const relativeToRoot = path.relative(RENDERER_DIR, absolutePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return absolutePath;
}

function createStaticServer() {
  return http.createServer((request, response) => {
    const requestedPath = resolveFilePath(request.url || '/');

    if (!requestedPath) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
      response.end('Forbidden');
      return;
    }

    fs.readFile(requestedPath, (error, content) => {
      if (error) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        response.end('Not Found');
        return;
      }

      const extension = path.extname(requestedPath).toLowerCase();
      const contentType = MIME_TYPES[extension] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(content);
    });
  });
}

async function captureScreenshot() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve());
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    console.log(`UI screenshot captured: ${SCREENSHOT_PATH}`);
  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

captureScreenshot().catch((error) => {
  console.error(`Failed to capture UI screenshot: ${error.message}`);
  process.exit(1);
});
