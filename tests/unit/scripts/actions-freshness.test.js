const {
  buildMarkdownReport,
  collectWorkflowReferences,
  parseWorkflowContent,
  splitReferencesByPinning,
} = require('../../../scripts/lib/actions-freshness');

describe('actions freshness helpers', () => {
  test('parseWorkflowContent captures reusable action references and pinning state', () => {
    const content = `
name: sample
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
      - uses: actions/setup-node@v4
      - uses: ./local-action
      - uses: docker://alpine:3
      - uses: github/codeql-action/upload-sarif@b5ebac6f4c00c8ccddb7cdcd45fdb248329f808a
`;
    const references = parseWorkflowContent(content, '.github/workflows/sample.yml');

    expect(references).toHaveLength(3);
    expect(references[0]).toMatchObject({
      action: 'actions/checkout',
      repositoryKey: 'actions/checkout',
      isPinned: true,
      ref: '34e114876b0b11c390a56381ad16ebd13914f8d5',
      lineNumber: 7,
    });
    expect(references[1]).toMatchObject({
      action: 'actions/setup-node',
      repositoryKey: 'actions/setup-node',
      isPinned: false,
      ref: 'v4',
      lineNumber: 8,
    });
    expect(references[2]).toMatchObject({
      action: 'github/codeql-action/upload-sarif',
      repositoryKey: 'github/codeql-action',
      isPinned: true,
      lineNumber: 11,
    });
  });

  test('collectWorkflowReferences and splitReferencesByPinning classify references across files', () => {
    const workflows = [
      {
        path: '.github/workflows/one.yml',
        content: '- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      },
      {
        path: '.github/workflows/two.yml',
        content: '- uses: actions/setup-node@v4',
      },
    ];

    const references = collectWorkflowReferences(workflows);
    const { pinned, unpinned } = splitReferencesByPinning(references);

    expect(references).toHaveLength(2);
    expect(pinned).toHaveLength(1);
    expect(unpinned).toHaveLength(1);
    expect(pinned[0].workflowPath).toBe('.github/workflows/one.yml');
    expect(unpinned[0].workflowPath).toBe('.github/workflows/two.yml');
  });

  test('parseWorkflowContent handles quoted references with inline comments', () => {
    const content = `
name: quoted
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: "actions/cache@v4" # cache
      - uses: 'actions/upload-artifact@v4' # upload
`;

    const references = parseWorkflowContent(content, '.github/workflows/quoted.yml');

    expect(references).toHaveLength(2);
    expect(references[0]).toMatchObject({
      action: 'actions/cache',
      ref: 'v4',
      isPinned: false,
      lineNumber: 7,
    });
    expect(references[1]).toMatchObject({
      action: 'actions/upload-artifact',
      ref: 'v4',
      isPinned: false,
      lineNumber: 8,
    });
  });

  test('buildMarkdownReport renders stale and unpinned sections', () => {
    const report = {
      generatedAt: '2026-02-11T00:00:00.000Z',
      workflowCount: 2,
      totalReferences: 3,
      pinnedCount: 2,
      unpinnedCount: 1,
      staleCount: 1,
      staleReferences: [
        {
          action: 'actions/checkout',
          ref: '34e114876b0b11c390a56381ad16ebd13914f8d5',
          latestTag: 'v5.0.0',
          latestSha: '1111111111111111111111111111111111111111',
          workflowPath: '.github/workflows/test.yml',
          lineNumber: 12,
        },
      ],
      unpinnedReferences: [
        {
          action: 'actions/setup-node',
          ref: 'v4',
          workflowPath: '.github/workflows/test.yml',
          lineNumber: 24,
        },
      ],
      resolutionErrors: [],
    };

    const markdown = buildMarkdownReport(report);

    expect(markdown).toContain('# GitHub Actions Freshness Report');
    expect(markdown).toContain('## Stale pinned references');
    expect(markdown).toContain('actions/checkout');
    expect(markdown).toContain('## Unpinned references');
    expect(markdown).toContain('actions/setup-node');
  });
});
