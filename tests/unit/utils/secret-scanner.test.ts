const fs = require('fs');
const {
  isSensitiveFilePath,
  scanContentForSecrets,
  scanFileForSecrets,
  shouldExcludeSuspiciousFiles,
} = require('../../../src/utils/secret-scanner');

jest.mock('fs');

const FAKE_GITHUB_TOKEN = ['ghp', 'AAAAAAAAAAAAAAAAAAAAAAAA'].join('_');
const FAKE_AWS_SECRET_ACCESS_KEY = 'A'.repeat(40);

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
      expect(isSensitiveFilePath('/repo/keys/private.pem')).toBe(true);
      expect(isSensitiveFilePath('/repo/id_rsa')).toBe(true);
    });

    test('should not mark regular source files as sensitive', () => {
      expect(isSensitiveFilePath('/repo/src/app.ts')).toBe(false);
      expect(isSensitiveFilePath('/repo/src/index.tsx')).toBe(false);
      expect(isSensitiveFilePath('/repo/docs/guide.md')).toBe(false);
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

  describe('scanFileForSecrets', () => {
    test('should detect secrets when file contains sensitive content', () => {
      fs.readFileSync.mockReturnValue(`const key = "${FAKE_GITHUB_TOKEN}";`);

      const result = scanFileForSecrets('/repo/src/config.ts');
      expect(result.isSuspicious).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    test('should fail safely if file cannot be read', () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('read error');
      });

      const result = scanFileForSecrets('/repo/src/missing.ts');
      expect(result).toEqual({
        isSuspicious: false,
        matches: [],
      });
    });
  });
});
