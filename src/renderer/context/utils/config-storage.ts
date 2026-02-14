import yaml from 'yaml';

import type { ConfigObject } from '../../../types/ipc';

export const INITIAL_CONFIG_PLACEHOLDER = '# Loading configuration...';

export const sanitizeConfigForStorage = (configContent: string): string => {
  try {
    const parsedConfig = yaml.parse(configContent);
    if (!parsedConfig || typeof parsedConfig !== 'object') {
      return configContent;
    }

    const config = parsedConfig as ConfigObject;
    if (!config.provider || typeof config.provider !== 'object' || !config.provider.api_key) {
      return configContent;
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
    return configContent;
  }
};
