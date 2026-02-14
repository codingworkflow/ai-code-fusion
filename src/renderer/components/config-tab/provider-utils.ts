import type { ProviderId } from '../../../types/ipc';

export type ProviderOption = {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
};

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    requiresApiKey: false,
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    defaultBaseUrl: 'http://127.0.0.1:8080/v1',
    requiresApiKey: true,
  },
];

export type ProviderFields = {
  providerId: ProviderId | '';
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl: string;
};

export const isSupportedProviderId = (value: unknown): value is ProviderId => {
  return (
    typeof value === 'string' &&
    PROVIDER_OPTIONS.some((providerOption) => providerOption.id === value)
  );
};

export const trimToUndefined = (value: string): string | undefined => {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

export const hasProviderInput = (providerFields: ProviderFields): boolean => {
  return Boolean(
    providerFields.providerId ||
      providerFields.providerModel.trim() ||
      providerFields.providerApiKey.trim() ||
      providerFields.providerBaseUrl.trim()
  );
};

export const getProviderValidationErrors = (
  providerFields: ProviderFields,
  translate: (key: string) => string
): string[] => {
  if (!hasProviderInput(providerFields)) {
    return [];
  }

  const errors: string[] = [];
  const { providerId, providerModel, providerApiKey, providerBaseUrl } = providerFields;

  if (!providerId) {
    errors.push(translate('config.validation.selectProvider'));
  }

  if (!providerModel.trim()) {
    errors.push(translate('config.validation.modelRequired'));
  }

  const selectedProviderOption = PROVIDER_OPTIONS.find(
    (providerOption) => providerOption.id === providerId
  );
  if (selectedProviderOption?.requiresApiKey && !providerApiKey.trim()) {
    errors.push(translate('config.validation.apiKeyRequired'));
  }

  if (providerBaseUrl.trim()) {
    try {
      const parsedUrl = new URL(providerBaseUrl.trim());
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push(translate('config.validation.baseUrlProtocol'));
      }
    } catch {
      errors.push(translate('config.validation.baseUrlValid'));
    }
  }

  return errors;
};
