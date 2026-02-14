import yaml from 'yaml';

import type { ConfigObject } from '../../../types/ipc';

export const INITIAL_CONFIG_PLACEHOLDER = '# Loading configuration...';

const redactApiKeyLines = (configContent: string): string => {
  const usesWindowsLineEndings = configContent.includes('\r\n');
  const normalizedContent = usesWindowsLineEndings
    ? configContent.replaceAll('\r\n', '\n')
    : configContent;
  const redactedContent = normalizedContent
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trimStart().toLowerCase();
      if (!trimmedLine.startsWith('api_key:')) {
        return line;
      }

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) {
        return line;
      }

      return `${line.slice(0, separatorIndex + 1)} [redacted]`;
    })
    .join('\n');

  return usesWindowsLineEndings ? redactedContent.replaceAll('\n', '\r\n') : redactedContent;
};

export const sanitizeConfigForStorage = (configContent: string): string => {
  try {
    const parsedConfig = yaml.parse(configContent);
    if (!parsedConfig || typeof parsedConfig !== 'object') {
      return redactApiKeyLines(configContent);
    }

    const config = parsedConfig as ConfigObject;
    if (!config.provider || typeof config.provider !== 'object' || !config.provider.api_key) {
      return redactApiKeyLines(configContent);
    }

    const sanitizedProvider = { ...config.provider };
    delete sanitizedProvider.api_key;

    const sanitizedConfig: ConfigObject = { ...config };
    const providerValues = Object.values(sanitizedProvider).filter((value) => value !== undefined);
    if (providerValues.length === 0) {
      delete sanitizedConfig.provider;
    } else {
      sanitizedConfig.provider = sanitizedProvider;
    }

    return yaml.stringify(sanitizedConfig);
  } catch {
    return redactApiKeyLines(configContent);
  }
};
