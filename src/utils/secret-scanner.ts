import fs from 'fs';
import path from 'path';
import type { ConfigObject } from '../types/ipc';

type SecretRule = {
  id: string;
  description: string;
  pattern: RegExp;
};

export interface SecretMatch {
  id: string;
  description: string;
}

export interface SecretScanResult {
  isSuspicious: boolean;
  matches: SecretMatch[];
}

const SECRET_RULES: SecretRule[] = [
  {
    id: 'private-key-block',
    description: 'Private key block detected',
    pattern: /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/m,
  },
  {
    id: 'github-token',
    description: 'GitHub token detected',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  },
  {
    id: 'aws-access-key-id',
    description: 'AWS access key id detected',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    id: 'aws-secret-assignment',
    description: 'AWS secret key assignment detected',
    pattern:
      /aws(?:_|[\s-])?secret(?:_|[\s-])?access(?:_|[\s-])?key\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/i,
  },
  {
    id: 'slack-token',
    description: 'Slack token detected',
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  },
  {
    id: 'stripe-secret-key',
    description: 'Stripe secret key detected',
    pattern: /\bsk_live_[0-9A-Za-z]{16,}\b/,
  },
  {
    id: 'jwt-token',
    description: 'JWT-like token detected',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    id: 'generic-credential-assignment',
    description: 'Credential assignment detected',
    pattern:
      /(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd|client[_-]?secret)\s*[:=]\s*['"][^'"\n]{8,}['"]/i,
  },
];

const SENSITIVE_FILE_NAME_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /(?:^|[-_.])(?:secret|secrets|credential|credentials)(?:[-_.]|$)/i,
];

const SENSITIVE_FILE_EXTENSION_PATTERN =
  /\.(?:pem|key|p12|pfx|jks|keystore|cer|crt|der|kdbx|asc)$/i;

const SENSITIVE_PATH_SEGMENTS = [
  '/.aws/credentials',
  '/.npmrc',
  '/.pypirc',
  '/.docker/config.json',
];

const normalizeFilePath = (filePath: string): string => filePath.replace(/\\/g, '/').toLowerCase();

export const shouldExcludeSuspiciousFiles = (config?: ConfigObject): boolean =>
  config?.enable_secret_scanning !== false && config?.exclude_suspicious_files !== false;

export const isSensitiveFilePath = (filePath: string): boolean => {
  const normalizedPath = normalizeFilePath(filePath);
  const fileName = path.basename(normalizedPath);

  if (SENSITIVE_FILE_EXTENSION_PATTERN.test(fileName)) {
    return true;
  }

  if (SENSITIVE_FILE_NAME_PATTERNS.some((pattern) => pattern.test(fileName))) {
    return true;
  }

  return SENSITIVE_PATH_SEGMENTS.some((segment) => normalizedPath.includes(segment));
};

export const scanContentForSecrets = (content: string): SecretScanResult => {
  const matches: SecretMatch[] = [];

  for (const rule of SECRET_RULES) {
    if (rule.pattern.test(content)) {
      matches.push({ id: rule.id, description: rule.description });
    }
  }

  return {
    isSuspicious: matches.length > 0,
    matches,
  };
};

export const scanFileForSecrets = (filePath: string): SecretScanResult => {
  try {
    const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
    return scanContentForSecrets(content);
  } catch (error) {
    console.error(`Error scanning file for secrets: ${filePath}`, error);
    return {
      isSuspicious: false,
      matches: [],
    };
  }
};
