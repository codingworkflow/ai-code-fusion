const { buildScannerOptions, DEFAULT_CPD_EXCLUSIONS } = require('../../../scripts/lib/sonar-options');

describe('buildScannerOptions', () => {
  test('uses sonar.cpd.exclusions from project properties when present', () => {
    const options = buildScannerOptions({
      projectKey: 'ai-code-fusion',
      projectName: 'Repository Code Fusion',
      projectVersion: '0.2.0',
      properties: {
        'sonar.cpd.exclusions': 'tests/**,src/**/__tests__/**',
      },
      sonarUrl: 'http://localhost:9000',
      sonarToken: '',
    });

    expect(options['sonar.cpd.exclusions']).toBe('tests/**,src/**/__tests__/**');
  });

  test('falls back to default cpd exclusions when property is missing', () => {
    const options = buildScannerOptions({
      projectKey: 'ai-code-fusion',
      properties: {},
      sonarUrl: 'http://localhost:9000',
      sonarToken: '',
    });

    expect(options['sonar.cpd.exclusions']).toBe(DEFAULT_CPD_EXCLUSIONS);
    expect(options['sonar.cpd.exclusions']).toContain('tests/**');
    expect(options['sonar.cpd.exclusions']).toContain('**/*.stress.test.ts');
  });

  test('preserves additional custom Sonar properties while setting required scanner fields', () => {
    const options = buildScannerOptions({
      projectKey: 'ai-code-fusion',
      properties: {
        'sonar.issue.ignore.multicriteria': 'nodeCoreImportStyle',
        'sonar.issue.ignore.multicriteria.nodeCoreImportStyle.ruleKey': 'typescript:S7772',
      },
      sonarUrl: 'http://localhost:9000',
      sonarToken: 'secret-token',
    });

    expect(options['sonar.issue.ignore.multicriteria']).toBe('nodeCoreImportStyle');
    expect(options['sonar.issue.ignore.multicriteria.nodeCoreImportStyle.ruleKey']).toBe(
      'typescript:S7772'
    );
    expect(options['sonar.token']).toBe('secret-token');
    expect(options['sonar.host.url']).toBe('http://localhost:9000');
  });

  test('ignores non-sonar property keys from input properties', () => {
    const options = buildScannerOptions({
      projectKey: 'ai-code-fusion',
      properties: {
        'sonar.sources': 'src',
        MALICIOUS_FLAG: 'true',
        'x-custom-setting': 'should-not-pass',
      },
      sonarUrl: 'http://localhost:9000',
      sonarToken: '',
    });

    expect(options['sonar.sources']).toBe('src');
    expect(options.MALICIOUS_FLAG).toBeUndefined();
    expect(options['x-custom-setting']).toBeUndefined();
  });
});
