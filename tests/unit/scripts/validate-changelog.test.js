const {
  validateChangelogContent,
  isValidIsoDate,
  isValidVersion,
  parseReleaseHeading,
} = require('../../../scripts/validate-changelog');

function buildRelease(version, date, sections = []) {
  const lines = [`## [${version}] - ${date}`, ''];

  for (const section of sections) {
    lines.push(`### ${section.title}`);
    lines.push('');
    lines.push(`- ${section.item}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function buildChangelog(releases) {
  return ['# Changelog', '', ...releases].join('\n');
}

function expectErrorContaining(errors, fragment) {
  expect(errors).toEqual(expect.arrayContaining([expect.stringContaining(fragment)]));
}

describe('validate-changelog script', () => {
  test('accepts a valid changelog document', () => {
    const content = buildChangelog([
      buildRelease('v1.2.3', '2026-02-11', [
        { title: 'Added', item: 'Added CI dependency snapshot submission.' },
        { title: 'Fixed', item: 'Updated action pins to current release commits.' },
      ]),
      buildRelease('v1.2.2', '2026-02-01', [
        { title: 'Security', item: 'Hardened workflow permissions.' },
      ]),
    ]);

    expect(validateChangelogContent(content)).toEqual([]);
  });

  test('rejects changelog content without release headings', () => {
    const errors = validateChangelogContent(buildChangelog(['No structured releases yet.']));
    expectErrorContaining(errors, 'No release headings were found');
  });

  test('rejects invalid release dates', () => {
    const errors = validateChangelogContent(
      buildChangelog([
        buildRelease('v1.2.3', '2026-02-31', [{ title: 'Added', item: 'Invalid calendar date.' }]),
      ])
    );
    expectErrorContaining(errors, 'invalid date');
  });

  test('rejects latest release without section headings', () => {
    const errors = validateChangelogContent(
      buildChangelog([
        ['## [v1.2.3] - 2026-02-11', '', '- Missing markdown section headings.', ''].join('\n'),
        buildRelease('v1.2.2', '2026-02-01', [{ title: 'Fixed', item: 'Prior release entry.' }]),
      ])
    );
    expectErrorContaining(errors, 'must include at least one section heading');
  });

  test('rejects unsupported release section headings', () => {
    const errors = validateChangelogContent(
      buildChangelog([
        buildRelease('v1.2.3', '2026-02-11', [{ title: 'Notes', item: 'Unsupported heading.' }]),
      ])
    );
    expectErrorContaining(errors, 'unsupported section heading');
  });

  test('validates ISO dates correctly', () => {
    expect(isValidIsoDate('2026-02-11')).toBe(true);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026/02/11')).toBe(false);
  });

  test('validates versions correctly', () => {
    expect(isValidVersion('v1.2.3')).toBe(true);
    expect(isValidVersion('1.2.3-alpha.1')).toBe(true);
    expect(isValidVersion('v1.2')).toBe(false);
    expect(isValidVersion('v1.2.3-')).toBe(false);
    expect(isValidVersion('v1.2.3-alpha..1')).toBe(false);
  });

  test('parses release headings using explicit format', () => {
    expect(parseReleaseHeading('## [v1.2.3] - 2026-02-11')).toEqual({
      version: 'v1.2.3',
      date: '2026-02-11',
      isValidVersion: true,
      isValidDate: true,
    });
    expect(parseReleaseHeading('## [v1.2.3] - 2026-02-31')).toEqual({
      version: 'v1.2.3',
      date: '2026-02-31',
      isValidVersion: true,
      isValidDate: false,
    });
    expect(parseReleaseHeading('## [invalid] - 2026-02-11')).toEqual({
      version: 'invalid',
      date: '2026-02-11',
      isValidVersion: false,
      isValidDate: true,
    });
  });
});
