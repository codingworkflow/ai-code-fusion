#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DEFAULT_CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');
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

function isDigitString(value) {
  if (value.length === 0) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (charCode < 48 || charCode > 57) {
      return false;
    }
  }

  return true;
}

function isAllowedPrereleaseChar(charCode) {
  const isNumeric = charCode >= 48 && charCode <= 57;
  const isUpper = charCode >= 65 && charCode <= 90;
  const isLower = charCode >= 97 && charCode <= 122;
  const isDot = charCode === 46;
  const isHyphen = charCode === 45;

  return isNumeric || isUpper || isLower || isDot || isHyphen;
}

function isValidPrerelease(value) {
  if (value.length === 0) {
    return false;
  }

  let previousWasSeparator = false;

  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);
    if (!isAllowedPrereleaseChar(charCode)) {
      return false;
    }

    const isSeparator = charCode === 45 || charCode === 46;
    if (isSeparator) {
      if (index === 0 || index === value.length - 1 || previousWasSeparator) {
        return false;
      }
    }

    previousWasSeparator = isSeparator;
  }

  return true;
}

function isValidVersion(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  const normalized = value.startsWith('v') ? value.slice(1) : value;
  const dashIndex = normalized.indexOf('-');
  if (dashIndex === normalized.length - 1) {
    return false;
  }

  const core = dashIndex >= 0 ? normalized.slice(0, dashIndex) : normalized;
  const prerelease = dashIndex >= 0 ? normalized.slice(dashIndex + 1) : '';
  const coreSegments = core.split('.');

  if (coreSegments.length !== 3 || !coreSegments.every(isDigitString)) {
    return false;
  }

  if (prerelease.length > 0 && !isValidPrerelease(prerelease)) {
    return false;
  }

  return true;
}

function parseReleaseHeading(line) {
  const trimmed = line.trimEnd();
  if (!trimmed.startsWith('## [')) {
    return null;
  }

  const closingBracketIndex = trimmed.indexOf(']');
  if (closingBracketIndex <= 4) {
    return null;
  }

  if (!trimmed.slice(closingBracketIndex + 1).startsWith(' - ')) {
    return null;
  }

  const version = trimmed.slice(4, closingBracketIndex);
  const date = trimmed.slice(closingBracketIndex + 4);

  if (date.length === 0) {
    return null;
  }

  return {
    version,
    date,
    isValidVersion: isValidVersion(version),
    isValidDate: isValidIsoDate(date),
  };
}

function collectReleaseHeadings(lines) {
  const headings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseReleaseHeading(lines[index]);
    if (!parsed) {
      continue;
    }

    headings.push({
      lineIndex: index,
      lineNumber: index + 1,
      version: parsed.version,
      date: parsed.date,
      isValidVersion: parsed.isValidVersion,
      isValidDate: parsed.isValidDate,
    });
  }

  return headings;
}

function collectSectionHeadings(lines, startLineIndex, endLineIndex) {
  const headings = [];

  for (let index = startLineIndex; index < endLineIndex; index += 1) {
    const trimmed = lines[index].trimEnd();
    if (!trimmed.startsWith('### ')) {
      continue;
    }

    const name = trimmed.slice(4).trim();
    if (name.length === 0) {
      continue;
    }

    headings.push({
      lineIndex: index,
      lineNumber: index + 1,
      name,
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
    if (!release.isValidVersion) {
      errors.push(
        `Release heading at line ${release.lineNumber} has an invalid version: \`${release.version}\`.`
      );
    }

    if (!release.isValidDate) {
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
  isValidVersion,
  parseReleaseHeading,
  validateChangelogContent,
  validateChangelogFile,
};
