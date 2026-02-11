#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');
const RELEASE_HEADING_PATTERN = /^##\s+\[(v?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)\]\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/;
const SECTION_HEADING_PATTERN = /^###\s+(.+?)\s*$/;
const ALLOWED_SECTION_HEADINGS = new Set([
  'Added',
  'Changed',
  'Improved',
  'Fixed',
  'Removed',
  'Deprecated',
  'Security',
]);
const STANDARD_SECTION_HEADINGS = new Set(['Added', 'Changed', 'Improved', 'Fixed', 'Security']);

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function collectReleaseHeadings(lines) {
  const headings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(RELEASE_HEADING_PATTERN);
    if (!match) {
      continue;
    }

    headings.push({
      lineIndex: index,
      lineNumber: index + 1,
      version: match[1],
      date: match[2],
    });
  }

  return headings;
}

function collectSectionHeadings(lines, startLineIndex, endLineIndex) {
  const headings = [];

  for (let index = startLineIndex; index < endLineIndex; index += 1) {
    const match = lines[index].match(SECTION_HEADING_PATTERN);
    if (!match) {
      continue;
    }

    headings.push({
      lineIndex: index,
      lineNumber: index + 1,
      name: match[1],
    });
  }

  return headings;
}

function validateChangelogContent(content) {
  const errors = [];

  if (typeof content !== 'string' || content.trim().length === 0) {
    errors.push('Changelog is empty.');
    return errors;
  }

  const lines = content.split(/\r?\n/);
  const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonEmptyIndex === -1 || lines[firstNonEmptyIndex].trim() !== '# Changelog') {
    errors.push('The changelog must start with a top-level `# Changelog` heading.');
  }

  const releases = collectReleaseHeadings(lines);
  if (releases.length === 0) {
    errors.push(
      'No release headings were found. Expected format: `## [vX.Y.Z] - YYYY-MM-DD` (or without the `v` prefix).'
    );
    return errors;
  }

  for (const release of releases) {
    if (!isValidIsoDate(release.date)) {
      errors.push(
        `Release heading at line ${release.lineNumber} has an invalid date: \`${release.date}\`.`
      );
    }
  }

  for (let index = 0; index < releases.length; index += 1) {
    const release = releases[index];
    const nextRelease = releases[index + 1];
    const sectionHeadings = collectSectionHeadings(
      lines,
      release.lineIndex + 1,
      nextRelease ? nextRelease.lineIndex : lines.length
    );

    for (const section of sectionHeadings) {
      if (!ALLOWED_SECTION_HEADINGS.has(section.name)) {
        errors.push(
          `Release ${release.version} has unsupported section heading \`${section.name}\` at line ${section.lineNumber}.`
        );
      }
    }

    if (index === 0) {
      if (sectionHeadings.length === 0) {
        errors.push(
          `Latest release ${release.version} must include at least one section heading (for example: Added, Changed, Improved, Fixed, Security).`
        );
        continue;
      }

      const hasStandardSection = sectionHeadings.some((section) =>
        STANDARD_SECTION_HEADINGS.has(section.name)
      );
      if (!hasStandardSection) {
        errors.push(
          `Latest release ${release.version} must include at least one standard section heading: Added, Changed, Improved, Fixed, or Security.`
        );
      }
    }
  }

  return errors;
}

function validateChangelogFile(changelogPath = DEFAULT_CHANGELOG_PATH) {
  let content = '';

  try {
    content = fs.readFileSync(changelogPath, 'utf8');
  } catch (error) {
    return [`Unable to read changelog file at ${changelogPath}: ${error.message}`];
  }

  return validateChangelogContent(content);
}

function run() {
  const targetPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_CHANGELOG_PATH;
  const errors = validateChangelogFile(targetPath);

  if (errors.length > 0) {
    console.error('Changelog validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Changelog validation passed: ${path.relative(ROOT_DIR, targetPath)}`);
}

if (require.main === module) {
  run();
}

module.exports = {
  ALLOWED_SECTION_HEADINGS,
  STANDARD_SECTION_HEADINGS,
  collectReleaseHeadings,
  collectSectionHeadings,
  isValidIsoDate,
  validateChangelogContent,
  validateChangelogFile,
};
