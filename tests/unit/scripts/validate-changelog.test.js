const {
  validateChangelogContent,
  isValidIsoDate,
  isValidVersion,
  parseReleaseHeading,
} = require('../../../scripts/validate-changelog');

describe('validate-changelog script', () => {
  test('accepts a valid changelog document', () => {
    const content = `# Changelog

## [v1.2.3] - 2026-02-11

### Added

- Added CI dependency snapshot submission.

### Fixed

- Updated action pins to current release commits.

## [v1.2.2] - 2026-02-01

### Security

- Hardened workflow permissions.
`;

    expect(validateChangelogContent(content)).toEqual([]);
  });

  test('rejects changelog content without release headings', () => {
    const content = `# Changelog

No structured releases yet.
`;

    const errors = validateChangelogContent(content);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('No release headings were found'),
      ])
    );
  });

  test('rejects invalid release dates', () => {
    const content = `# Changelog

## [v1.2.3] - 2026-02-31

### Added

- Invalid calendar date in heading.
`;

    const errors = validateChangelogContent(content);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('invalid date'),
      ])
    );
  });

  test('rejects latest release without section headings', () => {
    const content = `# Changelog

## [v1.2.3] - 2026-02-11

- Missing markdown section headings.

## [v1.2.2] - 2026-02-01

### Fixed

- Prior release entry.
`;

    const errors = validateChangelogContent(content);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must include at least one section heading'),
      ])
    );
  });

  test('rejects unsupported release section headings', () => {
    const content = `# Changelog

## [v1.2.3] - 2026-02-11

### Notes

- This section title is not supported.
`;

    const errors = validateChangelogContent(content);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unsupported section heading'),
      ])
    );
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
