const USES_LINE_PATTERN = 'uses:';
const ACTION_REFERENCE_PATTERN =
  /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(\/[A-Za-z0-9_.\-\/]+)?@([^\s]+)$/;
const FULL_LENGTH_SHA_PATTERN = /^[a-f0-9]{40}$/i;

function normalizeReferenceValue(referenceValue) {
  const trimmed = referenceValue.trim();

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function isFullLengthSha(value) {
  return FULL_LENGTH_SHA_PATTERN.test(value);
}

function extractUsesValue(line) {
  const trimmedStart = line.trimStart();
  const normalized = trimmedStart.startsWith('-')
    ? trimmedStart.slice(1).trimStart()
    : trimmedStart;

  if (!normalized.startsWith(USES_LINE_PATTERN)) {
    return '';
  }

  const withoutPrefix = normalized
    .slice(USES_LINE_PATTERN.length)
    .trimStart();
  const commentStart = withoutPrefix.search(/\s#/);
  const rawValue =
    commentStart >= 0 ? withoutPrefix.slice(0, commentStart) : withoutPrefix;

  return normalizeReferenceValue(rawValue.trim());
}

function parseWorkflowContent(content, workflowPath) {
  const references = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const usesValue = extractUsesValue(line);
    if (!usesValue) {
      continue;
    }

    if (usesValue.startsWith('./') || usesValue.startsWith('docker://')) {
      continue;
    }

    const actionMatch = usesValue.match(ACTION_REFERENCE_PATTERN);

    if (!actionMatch) {
      continue;
    }

    const owner = actionMatch[1];
    const repository = actionMatch[2];
    const subPath = actionMatch[3] || '';
    const ref = actionMatch[4];
    const repositoryKey = `${owner.toLowerCase()}/${repository.toLowerCase()}`;

    references.push({
      action: `${owner}/${repository}${subPath}`,
      owner,
      repository,
      repositoryKey,
      ref,
      isPinned: isFullLengthSha(ref),
      workflowPath,
      lineNumber: index + 1,
    });
  }

  return references;
}

function collectWorkflowReferences(workflows) {
  const references = [];

  for (const workflow of workflows) {
    const parsed = parseWorkflowContent(workflow.content, workflow.path);
    references.push(...parsed);
  }

  return references;
}

function splitReferencesByPinning(references) {
  const pinned = [];
  const unpinned = [];

  for (const reference of references) {
    if (reference.isPinned) {
      pinned.push(reference);
      continue;
    }

    unpinned.push(reference);
  }

  return { pinned, unpinned };
}

function shortSha(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.slice(0, 12);
}

function sortByLocation(left, right) {
  if (left.workflowPath === right.workflowPath) {
    return left.lineNumber - right.lineNumber;
  }

  return left.workflowPath.localeCompare(right.workflowPath);
}

function escapeMarkdownTableCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function buildMarkdownReport(report) {
  const lines = [
    '# GitHub Actions Freshness Report',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    `- Workflows scanned: ${report.workflowCount}`,
    `- Action references found: ${report.totalReferences}`,
    `- Full-SHA pinned references: ${report.pinnedCount}`,
    `- Unpinned references: ${report.unpinnedCount}`,
    `- Stale pinned references: ${report.staleCount}`,
    '',
  ];

  if (report.staleCount > 0) {
    lines.push('## Stale pinned references');
    lines.push('');
    lines.push('| Action | Pinned SHA | Latest tag | Latest SHA | Location |');
    lines.push('| --- | --- | --- | --- | --- |');

    const staleSorted = [...report.staleReferences].sort(sortByLocation);
    for (const stale of staleSorted) {
      lines.push(
        `| ${escapeMarkdownTableCell(stale.action)} | \`${escapeMarkdownTableCell(shortSha(stale.ref))}\` | \`${escapeMarkdownTableCell(stale.latestTag)}\` | \`${escapeMarkdownTableCell(shortSha(stale.latestSha))}\` | \`${escapeMarkdownTableCell(`${stale.workflowPath}:${stale.lineNumber}`)}\` |`
      );
    }

    lines.push('');
  }

  if (report.unpinnedCount > 0) {
    lines.push('## Unpinned references');
    lines.push('');
    lines.push('| Action | Ref | Location |');
    lines.push('| --- | --- | --- |');

    const unpinnedSorted = [...report.unpinnedReferences].sort(sortByLocation);
    for (const unpinned of unpinnedSorted) {
      lines.push(
        `| ${escapeMarkdownTableCell(unpinned.action)} | \`${escapeMarkdownTableCell(unpinned.ref)}\` | \`${escapeMarkdownTableCell(`${unpinned.workflowPath}:${unpinned.lineNumber}`)}\` |`
      );
    }

    lines.push('');
  }

  if (report.resolutionErrors.length > 0) {
    lines.push('## Resolution errors');
    lines.push('');
    lines.push('| Action repository | Error |');
    lines.push('| --- | --- |');

    const errorsSorted = [...report.resolutionErrors].sort((left, right) =>
      left.repository.localeCompare(right.repository)
    );
    for (const error of errorsSorted) {
      lines.push(
        `| ${escapeMarkdownTableCell(error.repository)} | ${escapeMarkdownTableCell(error.message)} |`
      );
    }

    lines.push('');
  }

  if (report.staleCount === 0 && report.resolutionErrors.length === 0) {
    lines.push('All pinned GitHub Actions references are current against latest upstream releases.');
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

module.exports = {
  ACTION_REFERENCE_PATTERN,
  FULL_LENGTH_SHA_PATTERN,
  USES_LINE_PATTERN,
  buildMarkdownReport,
  collectWorkflowReferences,
  isFullLengthSha,
  parseWorkflowContent,
  splitReferencesByPinning,
};
