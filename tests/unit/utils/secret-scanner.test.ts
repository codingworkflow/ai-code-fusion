const fs = require('fs');
const {
  isSensitiveFilePath,
  shouldExcludeSensitiveFilePath,
  scanContentForSecrets,
  scanContentForSecretsWithPolicy,
  scanFileForSecrets,
  shouldExcludeSuspiciousFiles,
} = require('../../../src/utils/secret-scanner');

jest.mock('fs');

const FAKE_GITHUB_TOKEN = ['ghp', 'AAAAAAAAAAAAAAAAAAAAAAAA'].join('_');
const FAKE_AWS_SECRET_ACCESS_KEY = 'A'.repeat(40);
const FAKE_SLACK_TOKEN = ['xoxb', '123456789012', '123456789012', 'aaaaaaaaaaaaaaaaaaaa'].join('-');
const FAKE_STRIPE_SECRET_KEY = ['sk_live', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'].join('_');
const FAKE_JWT = ['eyJ0eXAiOiJKV1Qi', 'eyJzdWIiOiJ0ZXN0LXVzZXIifQ', 'c2lnbmF0dXJlMTIzNDU2'].join('.');

describe('secret-scanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldExcludeSuspiciousFiles', () => {
    test('should be enabled by default', () => {
      expect(shouldExcludeSuspiciousFiles()).toBe(true);
      expect(shouldExcludeSuspiciousFiles({})).toBe(true);
    });

    test('should allow disabling secret scanning', () => {
      expect(shouldExcludeSuspiciousFiles({ enable_secret_scanning: false })).toBe(false);
      expect(shouldExcludeSuspiciousFiles({ exclude_suspicious_files: false })).toBe(false);
    });
  });

  describe('isSensitiveFilePath', () => {
    test('should detect sensitive file names and paths', () => {
      expect(isSensitiveFilePath('/repo/.env')).toBe(true);
      expect(isSensitiveFilePath('/repo/.env.production')).toBe(true);
      expect(isSensitiveFilePath('/repo/.aws/credentials')).toBe(true);
      expect(isSensitiveFilePath('.aws/credentials')).toBe(true);
      expect(isSensitiveFilePath('.npmrc')).toBe(true);
      expect(isSensitiveFilePath('/repo/keys/private.pem')).toBe(true);
      expect(isSensitiveFilePath('/repo/id_rsa')).toBe(true);
    });

    test('should not mark regular source files as sensitive', () => {
      expect(isSensitiveFilePath('/repo/src/app.ts')).toBe(false);
      expect(isSensitiveFilePath('/repo/src/index.tsx')).toBe(false);
      expect(isSensitiveFilePath('/repo/docs/guide.md')).toBe(false);
    });
  });

  describe('shouldExcludeSensitiveFilePath', () => {
    test('should exclude sensitive paths by default', () => {
      expect(shouldExcludeSensitiveFilePath('/repo/.env')).toBe(true);
      expect(shouldExcludeSensitiveFilePath('/repo/.aws/credentials')).toBe(true);
    });

    test('should keep sensitive paths when secret scanning is disabled', () => {
      expect(shouldExcludeSensitiveFilePath('/repo/.env', { enable_secret_scanning: false })).toBe(
        false
      );
      expect(shouldExcludeSensitiveFilePath('/repo/.env', { exclude_suspicious_files: false })).toBe(
        false
      );
    });
  });

  describe('scanContentForSecrets', () => {
    test('should detect known secret patterns', () => {
      const content = `
        const token = "${FAKE_GITHUB_TOKEN}";
        AWS_SECRET_ACCESS_KEY="${FAKE_AWS_SECRET_ACCESS_KEY}"
      `;

      const result = scanContentForSecrets(content);
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('should detect AWS secret key assignments independently', () => {
      const content = `AWS_SECRET_ACCESS_KEY="${FAKE_AWS_SECRET_ACCESS_KEY}"`;

      const result = scanContentForSecrets(content);
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.some((match) => match.id === 'aws-secret-assignment')).toBe(true);
    });

    test('should detect Slack tokens', () => {
      const content = `const slackToken = "${FAKE_SLACK_TOKEN}";`;

      const result = scanContentForSecrets(content);
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.some((match) => match.id === 'slack-token')).toBe(true);
    });

    test('should detect Stripe secret keys', () => {
      const content = `const stripeSecretKey = "${FAKE_STRIPE_SECRET_KEY}";`;

      const result = scanContentForSecrets(content);
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.some((match) => match.id === 'stripe-secret-key')).toBe(true);
    });

    test('should detect JWT-like tokens', () => {
      const content = `const jwt = "${FAKE_JWT}";`;

      const result = scanContentForSecrets(content);
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.some((match) => match.id === 'jwt-token')).toBe(true);
    });

    test('should detect generic credential assignments', () => {
      const secretPassword = ['test', 'password', '0001'].join('-');
      const content = `const password = "${secretPassword}";`;

      const result = scanContentForSecrets(content);
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.some((match) => match.id === 'credential-assignment')).toBe(true);
    });

    test('should return clean result for normal content', () => {
      const content = `
        export const sum = (a, b) => a + b;
        console.log("hello");
      `;

      const result = scanContentForSecrets(content);
      expect(result).toEqual({
        isSuspicious: false,
        matches: [],
      });
    });
  });

  describe('scanContentForSecretsWithPolicy', () => {
    test('should scan content when secret scanning policy is enabled', () => {
      const result = scanContentForSecretsWithPolicy(`const key = "${FAKE_GITHUB_TOKEN}";`);

      expect(result.isSuspicious).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('should skip content scan when secret scanning policy is disabled', () => {
      const result = scanContentForSecretsWithPolicy(`const key = "${FAKE_GITHUB_TOKEN}";`, {
        enable_secret_scanning: false,
      });

      expect(result).toEqual({
        isSuspicious: false,
        matches: [],
      });
    });
  });

  describe('scanFileForSecrets', () => {
    test('should detect secrets when file contains sensitive content', () => {
      fs.readFileSync.mockReturnValue(`const key = "${FAKE_GITHUB_TOKEN}";`);

      const result = scanFileForSecrets('/repo/src/config.ts');
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('should fail closed if file cannot be read', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('read error');
      });

      const result = scanFileForSecrets('/repo/src/missing.ts');
      expect(result.isSuspicious).toBe(true);
      expect(result.error).toBe('read error');
      expect(result.matches.some((match) => match.id === 'scan-read-error')).toBe(true);
    });
  });
});
