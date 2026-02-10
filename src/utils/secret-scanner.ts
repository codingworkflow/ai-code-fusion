import fs from 'fs';
import path from 'path';
import type { ConfigObject } from '../types/ipc';

type SecretRule = {
  id: string;
  description: string;
  pattern?: RegExp;
  matches?: (content: string) => boolean;
};

export interface SecretMatch {
  id: string;
  description: string;
}

export interface SecretScanResult {
  isSuspicious: boolean;
  matches: SecretMatch[];
  error?: string;
}

const AWS_SECRET_KEY_ASSIGNMENT_PREFIX =
  /aws(?:\s|_|-)?secret(?:\s|_|-)?access(?:\s|_|-)?key\s*[:=]\s*/gi;

const AWS_SECRET_KEY_VALUE = /^[A-Za-z0-9+/=]{40}$/;

const extractAssignedValue = (input: string): string => {
  const trimmed = input.trimStart();
  if (!trimmed) {
    return '';
  }

  const quoteCharacter = trimmed[0];
  if (quoteCharacter === '"' || quoteCharacter === "'") {
    const endQuoteIndex = trimmed.indexOf(quoteCharacter, 1);
    if (endQuoteIndex <= 0) {
      return '';
    }
    return trimmed.slice(1, endQuoteIndex);
  }

  const stopCharacterIndex = trimmed.search(/[\s;,]/);
  return stopCharacterIndex === -1 ? trimmed : trimmed.slice(0, stopCharacterIndex);
};

const hasAwsSecretAssignment = (content: string): boolean => {
  AWS_SECRET_KEY_ASSIGNMENT_PREFIX.lastIndex = 0;

  let assignmentMatch: RegExpExecArray | null;
  while ((assignmentMatch = AWS_SECRET_KEY_ASSIGNMENT_PREFIX.exec(content)) !== null) {
    const startIndex = assignmentMatch.index + assignmentMatch[0].length;
    const candidateValue = extractAssignedValue(content.slice(startIndex));
    if (AWS_SECRET_KEY_VALUE.test(candidateValue)) {
      AWS_SECRET_KEY_ASSIGNMENT_PREFIX.lastIndex = 0;
      return true;
    }
  }

  AWS_SECRET_KEY_ASSIGNMENT_PREFIX.lastIndex = 0;
  return false;
};

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
    matches: hasAwsSecretAssignment,
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
    id: 'token-assignment',
    description: 'Token assignment detected',
    pattern:
      /(?:api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][^'"\n]{8,}['"]/i,
  },
  {
    id: 'credential-assignment',
    description: 'Credential assignment detected',
    pattern: /(?:secret|password|passwd|client[_-]?secret)\s*[:=]\s*['"][^'"\n]{8,}['"]/i,
  },
];

const SENSITIVE_FILE_NAME_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /(?:^|[-_.])(?:secret|secrets|credential|credentials)(?:[-_.]|$)/i,
];

const SENSITIVE_FILE_EXTENSION_PATTERN =
  /\.(?:pem|key|p12|pfx|jks|keystore|cer|crt|der|kdbx|asc)$/i;

const SENSITIVE_PATH_SEGMENTS = ['.aws/credentials', '.npmrc', '.pypirc', '.docker/config.json'];

const normalizeFilePath = (filePath: string): string => filePath.replaceAll('\\', '/').toLowerCase();

export const shouldExcludeSuspiciousFiles = (config?: ConfigObject): boolean =>
  config?.enable_secret_scanning !== false && config?.exclude_suspicious_files !== false;

const cleanSecretScanResult = (): SecretScanResult => ({
  isSuspicious: false,
  matches: [],
});

export const isSensitiveFilePath = (filePath: string): boolean => {
  const normalizedPath = normalizeFilePath(filePath);
  const fileName = path.basename(normalizedPath);

  if (SENSITIVE_FILE_EXTENSION_PATTERN.test(fileName)) {
    return true;
  }

  if (SENSITIVE_FILE_NAME_PATTERNS.some((pattern) => pattern.test(fileName))) {
    return true;
  }

  return SENSITIVE_PATH_SEGMENTS.some((segment) => {
    const normalizedSegment = segment.toLowerCase();
    return (
      normalizedPath === normalizedSegment ||
      normalizedPath.endsWith(`/${normalizedSegment}`) ||
      normalizedPath.includes(`/${normalizedSegment}/`)
    );
  });
};

export const shouldExcludeSensitiveFilePath = (filePath: string, config?: ConfigObject): boolean =>
  shouldExcludeSuspiciousFiles(config) && isSensitiveFilePath(filePath);

export const scanContentForSecrets = (content: string): SecretScanResult => {
  const matches: SecretMatch[] = [];

  for (const rule of SECRET_RULES) {
    const isMatch =
      typeof rule.matches === 'function'
        ? rule.matches(content)
        : rule.pattern?.test(content) === true;
    if (isMatch) {
      matches.push({ id: rule.id, description: rule.description });
    }
  }

  return {
    isSuspicious: matches.length > 0,
    matches,
  };
};

export const scanContentForSecretsWithPolicy = (
  content: string,
  config?: ConfigObject
): SecretScanResult => {
  if (!shouldExcludeSuspiciousFiles(config)) {
    return cleanSecretScanResult();
  }

  return scanContentForSecrets(content);
};

export const scanFileForSecrets = (filePath: string): SecretScanResult => {
  try {
    const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
    return scanContentForSecrets(content);
  } catch (error) {
    console.error(`Error scanning file for secrets: ${filePath}`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isSuspicious: true,
      matches: [
        {
          id: 'scan-read-error',
          description: 'Unable to read file while scanning for secrets',
        },
      ],
      error: errorMessage,
    };
  }
};
