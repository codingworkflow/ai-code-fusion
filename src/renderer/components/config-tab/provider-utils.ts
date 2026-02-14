import {
  PROVIDER_OPTIONS,
  type ProviderId,
} from '../../../shared/provider-registry';

export { isSupportedProviderId } from '../../../shared/provider-registry';
export type { ProviderOption } from '../../../shared/provider-registry';
export { PROVIDER_OPTIONS } from '../../../shared/provider-registry';

export type ProviderFields = {
  providerId: ProviderId | '';
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl: string;
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
