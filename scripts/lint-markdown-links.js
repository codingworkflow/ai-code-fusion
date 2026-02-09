#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');

const IGNORED_PROTOCOLS = ['http://', 'https://', 'mailto:', 'tel:', 'data:', 'javascript:'];
const DECORATIVE_ICON_PATTERN = /\p{Extended_Pictographic}/u;

function ensureError(error) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

function getMarkdownFiles() {
  try {
    const output = execSync('git ls-files "*.md"', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((filePath) => path.join(ROOT_DIR, filePath));
  } catch (error) {
    throw new Error(`Unable to list markdown files: ${ensureError(error).message}`);
  }
}

function isExternalTarget(target) {
  const normalizedTarget = target.toLowerCase();
  return IGNORED_PROTOCOLS.some((protocol) => normalizedTarget.startsWith(protocol));
}

function normalizeTarget(rawTarget) {
  if (!rawTarget) {
    return '';
  }

  let target = rawTarget.trim();

  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }

  const titleSuffixMatch = target.match(/^([^\s]+)\s+["'(].*$/);
  if (titleSuffixMatch) {
    target = titleSuffixMatch[1];
  }

  return target;
}

function resolveTargetPath(markdownFilePath, target) {
  const [pathWithoutAnchor] = target.split('#');

  if (!pathWithoutAnchor || isExternalTarget(pathWithoutAnchor) || pathWithoutAnchor.startsWith('#')) {
    return null;
  }

  if (path.isAbsolute(pathWithoutAnchor)) {
    return path.resolve(ROOT_DIR, `.${pathWithoutAnchor}`);
  }

  return path.resolve(path.dirname(markdownFilePath), pathWithoutAnchor);
}

function extractTargetsFromLine(line) {
  const targets = [];

  const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let linkMatch;
  while ((linkMatch = markdownLinkPattern.exec(line)) !== null) {
    targets.push(linkMatch[1]);
  }

  const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let imageMatch;
  while ((imageMatch = htmlImagePattern.exec(line)) !== null) {
    targets.push(imageMatch[1]);
  }

  return targets;
}

function lintMarkdownFile(markdownFilePath) {
  const content = fs.readFileSync(markdownFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const errors = [];

  let inFenceBlock = false;
  let fenceMarker = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(```|~~~)/);

    if (fenceMatch) {
      const currentFenceMarker = fenceMatch[1];
      if (!inFenceBlock) {
        inFenceBlock = true;
        fenceMarker = currentFenceMarker;
      } else if (currentFenceMarker === fenceMarker) {
        inFenceBlock = false;
        fenceMarker = '';
      }
      continue;
    }

    if (inFenceBlock) {
      continue;
    }

    if (DECORATIVE_ICON_PATTERN.test(line)) {
      errors.push({
        kind: 'decorative-icon',
        filePath: markdownFilePath,
        lineNumber: index + 1,
        lineText: line.trim(),
      });
    }

    const rawTargets = extractTargetsFromLine(line);
    for (const rawTarget of rawTargets) {
      const normalizedTarget = normalizeTarget(rawTarget);
      if (!normalizedTarget || isExternalTarget(normalizedTarget) || normalizedTarget.startsWith('#')) {
        continue;
      }

      const resolvedTargetPath = resolveTargetPath(markdownFilePath, normalizedTarget);
      if (!resolvedTargetPath) {
        continue;
      }

      if (!fs.existsSync(resolvedTargetPath)) {
        errors.push({
          kind: 'missing-target',
          filePath: markdownFilePath,
          lineNumber: index + 1,
          target: normalizedTarget,
          resolvedPath: resolvedTargetPath,
        });
      }
    }
  }

  return errors;
}

function run() {
  const markdownFiles = getMarkdownFiles();
  let linkCount = 0;
  const allErrors = [];

  for (const markdownFilePath of markdownFiles) {
    const fileErrors = lintMarkdownFile(markdownFilePath);
    allErrors.push(...fileErrors);

    const content = fs.readFileSync(markdownFilePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      linkCount += extractTargetsFromLine(line).length;
    }
  }

  if (allErrors.length > 0) {
    console.error('Markdown docs lint failed:\n');
    for (const error of allErrors) {
      const relativeFilePath = path.relative(ROOT_DIR, error.filePath);

      if (error.kind === 'decorative-icon') {
        console.error(`- ${relativeFilePath}:${error.lineNumber} -> decorative icon found: ${error.lineText}`);
        continue;
      }

      const relativeResolvedPath = path.relative(ROOT_DIR, error.resolvedPath);
      console.error(`- ${relativeFilePath}:${error.lineNumber} -> ${error.target} (missing: ${relativeResolvedPath})`);
    }
    process.exit(1);
  }

  console.log(
    `Markdown docs lint passed: ${markdownFiles.length} markdown files checked, ${linkCount} links/images scanned, no decorative icons found.`
  );
}

run();
