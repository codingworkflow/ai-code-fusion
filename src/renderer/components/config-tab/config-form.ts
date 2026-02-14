import * as yaml from 'yaml';

import { normalizeExportFormat } from '../../../utils/export-format';
import { yamlArrayToPlainText } from '../../../utils/formatters/list-formatter';

import {
  getProviderValidationErrors,
  hasProviderInput,
  isSupportedProviderId,
  trimToUndefined,
} from './provider-utils';

import type { ConfigObject, ExportFormat, ProviderId } from '../../../types/ipc';

export type ConfigFormState = {
  useCustomExcludes: boolean;
  useCustomIncludes: boolean;
  useGitignore: boolean;
  enableSecretScanning: boolean;
  excludeSuspiciousFiles: boolean;
  includeTreeView: boolean;
  showTokenCount: boolean;
  exportFormat: ExportFormat;
  fileExtensions: string;
  excludePatterns: string;
  providerId: ProviderId | '';
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl: string;
};

type SetFieldAction = {
  [K in keyof ConfigFormState]: {
    type: 'SET_FIELD';
    field: K;
    value: ConfigFormState[K];
  };
}[keyof ConfigFormState];

export type ConfigFormAction =
  | SetFieldAction
  | { type: 'LOAD_FROM_CONFIG'; config: ConfigObject; aiSurfacesEnabled: boolean };

export const initialFormState: ConfigFormState = {
  useCustomExcludes: true,
  useCustomIncludes: true,
  useGitignore: true,
  enableSecretScanning: true,
  excludeSuspiciousFiles: true,
  includeTreeView: false,
  showTokenCount: true,
  exportFormat: 'markdown',
  fileExtensions: '',
  excludePatterns: '',
  providerId: '',
  providerModel: '',
  providerApiKey: '',
  providerBaseUrl: '',
};

const toPlainTextList = (value: unknown): string => {
  return Array.isArray(value) ? yamlArrayToPlainText(value) : '';
};

const toTrimmedLines = (value: string): string[] => {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

const extractProviderFormFields = (
  config: ConfigObject,
  aiSurfacesEnabled: boolean
): Pick<ConfigFormState, 'providerId' | 'providerModel' | 'providerApiKey' | 'providerBaseUrl'> => {
  if (!aiSurfacesEnabled || !config.provider) {
    return {
      providerId: '',
      providerModel: '',
      providerApiKey: '',
      providerBaseUrl: '',
    };
  }

  const providerConfig = config.provider;
  return {
    providerId: isSupportedProviderId(providerConfig.id) ? providerConfig.id : '',
    providerModel: typeof providerConfig.model === 'string' ? providerConfig.model : '',
    providerApiKey: typeof providerConfig.api_key === 'string' ? providerConfig.api_key : '',
    providerBaseUrl: typeof providerConfig.base_url === 'string' ? providerConfig.base_url : '',
  };
};

const loadFormStateFromConfig = (
  state: ConfigFormState,
  config: ConfigObject,
  aiSurfacesEnabled: boolean
): ConfigFormState => {
  const providerFields = extractProviderFormFields(config, aiSurfacesEnabled);
  return {
    ...state,
    fileExtensions: toPlainTextList(config.include_extensions),
    excludePatterns: toPlainTextList(config.exclude_patterns),
    useCustomExcludes: config.use_custom_excludes !== false,
    useCustomIncludes: config.use_custom_includes !== false,
    useGitignore: config.use_gitignore !== false,
    enableSecretScanning: config.enable_secret_scanning !== false,
    excludeSuspiciousFiles: config.exclude_suspicious_files !== false,
    includeTreeView: config.include_tree_view === true,
    showTokenCount: config.show_token_count !== false,
    exportFormat: normalizeExportFormat(config.export_format),
    ...providerFields,
  };
};

export const configFormReducer = (state: ConfigFormState, action: ConfigFormAction): ConfigFormState => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'LOAD_FROM_CONFIG':
      return loadFormStateFromConfig(state, action.config, action.aiSurfacesEnabled);
    default:
      return state;
  }
};

export const parseConfigContent = (configContent: string): ConfigObject | null => {
  try {
    const parsedConfig = yaml.parse(configContent) as ConfigObject;
    if (!parsedConfig || typeof parsedConfig !== 'object') {
      return {};
    }
    return parsedConfig;
  } catch {
    return null;
  }
};

export const applyBaseConfigState = (config: ConfigObject, state: ConfigFormState): void => {
  config.use_custom_excludes = state.useCustomExcludes;
  config.use_custom_includes = state.useCustomIncludes;
  config.use_gitignore = state.useGitignore;
  config.enable_secret_scanning = state.enableSecretScanning;
  config.exclude_suspicious_files = state.excludeSuspiciousFiles;
  config.include_tree_view = state.includeTreeView;
  config.show_token_count = state.showTokenCount;
  config.export_format = state.exportFormat;
  config.include_extensions = toTrimmedLines(state.fileExtensions);
  config.exclude_patterns = toTrimmedLines(state.excludePatterns);
};

export type ProviderConfigSaveResult = {
  hasValidationErrors: boolean;
  validationErrors: string[];
};

export const applyProviderConfigState = (
  config: ConfigObject,
  state: ConfigFormState,
  aiSurfacesEnabled: boolean,
  translate: (key: string) => string
): ProviderConfigSaveResult => {
  if (!aiSurfacesEnabled) {
    return { hasValidationErrors: false, validationErrors: [] };
  }

  const providerFields = {
    providerId: state.providerId,
    providerModel: state.providerModel,
    providerApiKey: state.providerApiKey,
    providerBaseUrl: state.providerBaseUrl,
  };
  const validationErrors = getProviderValidationErrors(providerFields, translate);
  const hasValidationErrors = validationErrors.length > 0;

  if (hasValidationErrors) {
    if (config.provider) {
      delete config.provider;
    }
    return { hasValidationErrors, validationErrors };
  }

  if (hasProviderInput(providerFields) && state.providerId) {
    config.provider = {
      id: state.providerId,
      model: state.providerModel.trim(),
      api_key: trimToUndefined(state.providerApiKey),
      base_url: trimToUndefined(state.providerBaseUrl),
    };
    return { hasValidationErrors, validationErrors };
  }

  if (config.provider) {
    delete config.provider;
  }

  return { hasValidationErrors, validationErrors };
};
