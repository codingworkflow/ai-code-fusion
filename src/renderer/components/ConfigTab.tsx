import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import yaml from 'yaml';

import { normalizeExportFormat } from '../../utils/export-format';
import { yamlArrayToPlainText } from '../../utils/formatters/list-formatter';
import { useApp } from '../context/AppContext';
import { isAiSurfacesEnabled } from '../feature-flags';

import type {
  ConfigObject,
  ExportFormat,
  ProviderConnectionResult,
  ProviderId,
} from '../../types/ipc';

type ConfigTabProps = {
  configContent: string;
  onConfigChange: (config: string) => void;
};

const PROVIDER_OPTIONS: Array<{
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
}> = [
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

const isSupportedProviderId = (value: unknown): value is ProviderId => {
  return (
    typeof value === 'string' &&
    PROVIDER_OPTIONS.some((providerOption) => providerOption.id === value)
  );
};

const trimToUndefined = (value: string): string | undefined => {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const hasProviderInput = (providerFields: {
  providerId: ProviderId | '';
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl: string;
}): boolean => {
  return Boolean(
    providerFields.providerId ||
      providerFields.providerModel.trim() ||
      providerFields.providerApiKey.trim() ||
      providerFields.providerBaseUrl.trim()
  );
};

const getProviderValidationErrors = (providerFields: {
  providerId: ProviderId | '';
  providerModel: string;
  providerApiKey: string;
  providerBaseUrl: string;
}, translate: (key: string) => string): string[] => {
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

// Config form state managed by useReducer
type ConfigFormState = {
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

type ConfigFormAction =
  | { type: 'SET_FIELD'; field: keyof ConfigFormState; value: ConfigFormState[keyof ConfigFormState] }
  | { type: 'LOAD_FROM_CONFIG'; config: ConfigObject; aiSurfacesEnabled: boolean };

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

const configFormReducer = (state: ConfigFormState, action: ConfigFormAction): ConfigFormState => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'LOAD_FROM_CONFIG':
      return loadFormStateFromConfig(state, action.config, action.aiSurfacesEnabled);
    default:
      return state;
  }
};

const initialFormState: ConfigFormState = {
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

const parseConfigContent = (configContent: string): ConfigObject => {
  try {
    const parsedConfig = yaml.parse(configContent) as ConfigObject;
    if (!parsedConfig || typeof parsedConfig !== 'object') {
      return {};
    }
    return parsedConfig;
  } catch (error) {
    console.error('Error parsing config content, using empty config:', error);
    return {};
  }
};

const applyBaseConfigState = (config: ConfigObject, state: ConfigFormState): void => {
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

type ProviderConfigSaveResult = {
  hasValidationErrors: boolean;
  validationErrors: string[];
};

const applyProviderConfigState = (
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

const ConfigTab = ({ configContent, onConfigChange }: ConfigTabProps) => {
  const { t } = useTranslation();
  const { rootPath, selectDirectory, switchTab } = useApp();
  const [formState, dispatch] = useReducer(configFormReducer, initialFormState);
  const [isSaved, setIsSaved] = useState(false);
  const [providerValidationErrors, setProviderValidationErrors] = useState<string[]>([]);
  const [providerTestResult, setProviderTestResult] = useState<ProviderConnectionResult | null>(
    null
  );
  const [isTestingProviderConnection, setIsTestingProviderConnection] = useState(false);
  const formStateRef = useRef(formState);
  formStateRef.current = formState;
  const appWindow = globalThis as Window & typeof globalThis;
  const aiSurfacesEnabled = isAiSurfacesEnabled();

  // Load form state from config prop
  useEffect(() => {
    try {
      const config = (yaml.parse(configContent) || {}) as ConfigObject;
      dispatch({ type: 'LOAD_FROM_CONFIG', config, aiSurfacesEnabled });
      setProviderValidationErrors([]);
      setProviderTestResult(null);
    } catch (error) {
      console.error('Error parsing config:', error);
    }
  }, [aiSurfacesEnabled, configContent]);

  // Save config from form state - accepts explicit state to keep identity stable
  const saveConfig = useCallback(
    (state: ConfigFormState) => {
      try {
        const config = parseConfigContent(configContent);
        applyBaseConfigState(config, state);

        const providerResult = applyProviderConfigState(config, state, aiSurfacesEnabled, t);
        if (aiSurfacesEnabled && providerResult.hasValidationErrors) {
          setProviderValidationErrors(providerResult.validationErrors);
          setProviderTestResult({
            ok: false,
            message: t('config.providerFixBeforeSaving'),
          });
        } else if (!aiSurfacesEnabled) {
          setProviderValidationErrors([]);
          setProviderTestResult(null);
        }

        const updatedConfig = yaml.stringify(config);

        // Guard against no-op updates to prevent circular effects
        if (updatedConfig === configContent) {
          return;
        }

        onConfigChange(updatedConfig);

        if (providerResult.hasValidationErrors) {
          setIsSaved(false);
          return;
        }

        setProviderValidationErrors([]);
        setIsSaved(true);
        setTimeout(() => {
          setIsSaved(false);
        }, 1500);
      } catch (error) {
        console.error('Error updating config:', error);
      }
    },
    [aiSurfacesEnabled, configContent, onConfigChange, t]
  );

  // Auto-save on checkbox/select changes (not text fields - those save on blur/button)
  useEffect(() => {
    const timer = setTimeout(() => saveConfig(formStateRef.current), 50);
    return () => clearTimeout(timer);
  }, [
    formState.useCustomExcludes,
    formState.useCustomIncludes,
    formState.useGitignore,
    formState.enableSecretScanning,
    formState.excludeSuspiciousFiles,
    formState.includeTreeView,
    formState.showTokenCount,
    formState.exportFormat,
    saveConfig,
  ]);

  const resetProviderFeedback = () => {
    setProviderValidationErrors([]);
    setProviderTestResult(null);
  };

  const handleTestProviderConnection = async () => {
    if (!aiSurfacesEnabled) {
      setProviderTestResult({
        ok: false,
        message: t('config.providerTestDisabled'),
      });
      return;
    }

    const providerFields = {
      providerId: formState.providerId,
      providerModel: formState.providerModel,
      providerApiKey: formState.providerApiKey,
      providerBaseUrl: formState.providerBaseUrl,
    };
    const validationErrors = getProviderValidationErrors(providerFields, t);
    if (validationErrors.length > 0) {
      setProviderValidationErrors(validationErrors);
      setProviderTestResult({
        ok: false,
        message: t('config.providerFixBeforeTesting'),
      });
      return;
    }

    if (!formState.providerId) {
      setProviderValidationErrors([t('config.validation.selectProvider')]);
      return;
    }

    if (!appWindow.electronAPI?.testProviderConnection) {
      setProviderTestResult({
        ok: false,
        message: t('config.providerUnavailable'),
      });
      return;
    }

    setIsTestingProviderConnection(true);
    setProviderTestResult(null);

    try {
      const result = await appWindow.electronAPI.testProviderConnection({
        providerId: formState.providerId,
        model: formState.providerModel.trim(),
        apiKey: formState.providerApiKey.trim(),
        baseUrl: trimToUndefined(formState.providerBaseUrl),
      });
      setProviderTestResult(result);
      if (result.ok) {
        setProviderValidationErrors([]);
      }
    } catch (error) {
      setProviderTestResult({
        ok: false,
        message: t('config.connectionTestFailed', {
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      });
    } finally {
      setIsTestingProviderConnection(false);
    }
  };

  const handleFolderSelect = async () => {
    const selected = await selectDirectory();
    if (selected) {
      switchTab('source');
    }
  };

  const setField = <K extends keyof ConfigFormState>(field: K, value: ConfigFormState[K]) => {
    dispatch({ type: 'SET_FIELD', field, value });
  };

  return (
    <div>
      {/* Folder selector */}
      <div className='mb-4'>
        <div className='flex'>
          <input
            type='text'
            className='grow border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 cursor-pointer'
            value={rootPath}
            readOnly
            placeholder={t('config.selectRootFolderPlaceholder')}
            onClick={handleFolderSelect}
            title={t('config.browseDirectoryTitle')}
          />
          <button
            onClick={handleFolderSelect}
            data-testid='select-folder-button'
            className='ml-2 inline-flex items-center border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          >
            <svg
              className='w-4 h-4 mr-1'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              xmlns='http://www.w3.org/2000/svg'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'
              />
            </svg>
            {t('config.selectFolder')}
          </button>
        </div>
      </div>

      <div className='mb-4'>
        <div className='rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-2'>
            {/* File Filtering section */}
            <div className='rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                {t('config.fileFilteringTitle')}
              </h4>

              <div className='space-y-2'>
                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-custom-includes'
                    checked={formState.useCustomIncludes}
                    onChange={(e) => setField('useCustomIncludes', e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='use-custom-includes'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.filterByExtensions')}
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-custom-excludes'
                    checked={formState.useCustomExcludes}
                    onChange={(e) => setField('useCustomExcludes', e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='use-custom-excludes'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.useExcludePatterns')}
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-gitignore'
                    checked={formState.useGitignore}
                    onChange={(e) => setField('useGitignore', e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='use-gitignore'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.applyGitignoreRules')}
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='enable-secret-scanning'
                    checked={formState.enableSecretScanning}
                    onChange={(e) => setField('enableSecretScanning', e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='enable-secret-scanning'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.scanSecrets')}
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='exclude-suspicious-files'
                    checked={formState.excludeSuspiciousFiles}
                    onChange={(e) => setField('excludeSuspiciousFiles', e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='exclude-suspicious-files'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.excludeSuspiciousFiles')}
                  </label>
                </div>
              </div>
            </div>

            {/* Output Formatting section */}
            <div className='rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                {t('config.outputFormattingTitle')}
              </h4>

              <div className='space-y-2'>
                <div className='flex items-center'>
                  <input
                    id='include-tree-view'
                    type='checkbox'
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    checked={formState.includeTreeView}
                    onChange={(e) => setField('includeTreeView', e.target.checked)}
                  />
                  <label
                    htmlFor='include-tree-view'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.includeFileTree')}
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    id='show-token-count'
                    type='checkbox'
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    checked={formState.showTokenCount}
                    onChange={(e) => setField('showTokenCount', e.target.checked)}
                  />
                  <label
                    htmlFor='show-token-count'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.displayTokenCounts')}
                  </label>
                </div>

                <div>
                  <label
                    htmlFor='export-format'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.exportFormat')}
                  </label>
                  <select
                    id='export-format'
                    value={formState.exportFormat}
                    onChange={(event) => setField('exportFormat', normalizeExportFormat(event.target.value))}
                    data-testid='export-format-select'
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  >
                    <option value='markdown'>{t('config.exportFormatMarkdown')}</option>
                    <option value='xml'>{t('config.exportFormatXml')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {aiSurfacesEnabled && (
            <div className='rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-4 mt-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                {t('config.providerSetupTitle')}
              </h4>
              <p className='mb-3 text-xs text-gray-500 dark:text-gray-400'>
                {t('config.providerSetupDescription')}
              </p>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <div>
                  <label
                    htmlFor='provider-id'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.provider')}
                  </label>
                  <select
                    id='provider-id'
                    value={formState.providerId}
                    onChange={(event) => {
                      setField(
                        'providerId',
                        isSupportedProviderId(event.target.value) ? event.target.value : ''
                      );
                      resetProviderFeedback();
                    }}
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  >
                    <option value=''>{t('config.selectProvider')}</option>
                    {PROVIDER_OPTIONS.map((providerOption) => (
                      <option key={providerOption.id} value={providerOption.id}>
                        {providerOption.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor='provider-model'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.model')}
                  </label>
                  <input
                    id='provider-model'
                    type='text'
                    value={formState.providerModel}
                    placeholder={t('config.modelPlaceholder')}
                    onChange={(event) => {
                      setField('providerModel', event.target.value);
                      resetProviderFeedback();
                    }}
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  />
                </div>

                <div>
                  <label
                    htmlFor='provider-base-url'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.baseUrlOptional')}
                  </label>
                  <input
                    id='provider-base-url'
                    type='text'
                    value={formState.providerBaseUrl}
                    placeholder={
                      PROVIDER_OPTIONS.find((providerOption) => providerOption.id === formState.providerId)
                        ?.defaultBaseUrl || 'https://api.openai.com/v1'
                    }
                    onChange={(event) => {
                      setField('providerBaseUrl', event.target.value);
                      resetProviderFeedback();
                    }}
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  />
                </div>

                <div>
                  <label
                    htmlFor='provider-api-key'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    {t('config.apiKeyOptionalOllama')}
                  </label>
                  <input
                    id='provider-api-key'
                    type='password'
                    value={formState.providerApiKey}
                    placeholder={t('config.apiKeyPlaceholder')}
                    onChange={(event) => {
                      setField('providerApiKey', event.target.value);
                      resetProviderFeedback();
                    }}
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  />
                </div>
              </div>

              <div className='mt-3 flex items-center gap-2'>
                <button
                  onClick={handleTestProviderConnection}
                  disabled={isTestingProviderConnection}
                  className='inline-flex items-center border border-transparent bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 focus:outline-none'
                >
                  {isTestingProviderConnection ? t('config.testing') : t('config.testConnection')}
                </button>

                {providerTestResult && (
                  <span
                    className={`text-xs ${
                      providerTestResult.ok
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    {providerTestResult.message}
                  </span>
                )}
              </div>

              {providerValidationErrors.length > 0 && (
                <ul className='mt-3 list-disc pl-5 text-xs text-red-700 dark:text-red-300 space-y-1'>
                  {providerValidationErrors.map((validationError) => (
                    <li key={validationError}>{validationError}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <p className='mt-3 text-xs text-gray-500 dark:text-gray-400'>
            {t('config.autoSaveHint')}
          </p>
        </div>
      </div>

      <div className='mb-4'>
        <div className='mb-1 flex items-center justify-end'>
          <button
            onClick={() => saveConfig(formState)}
            className='inline-flex items-center border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none'
          >
            {isSaved ? t('config.savedConfig') : t('config.saveConfig')}
          </button>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700 dark:text-gray-300'>
              {t('config.includeExtensionsTitle')}
            </h4>
            <p className='text-xs text-gray-500 dark:text-gray-400 mb-1'>
              {t('config.includeExtensionsHint')}
            </p>
            <textarea
              className='h-44 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={formState.fileExtensions}
              placeholder='.py
.js
.jsx
.ts
.tsx'
              onChange={(e) => setField('fileExtensions', e.target.value)}
            />
          </div>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700 dark:text-gray-300'>
              {t('config.excludePatternsTitle')}
            </h4>
            <p className='text-xs text-gray-500 dark:text-gray-400 mb-1'>
              {t('config.excludePatternsHint')}
            </p>
            <textarea
              className='h-44 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={formState.excludePatterns}
              placeholder='**/.git/**
**/node_modules/**
**/dist/**
**/build/**'
              onChange={(e) => setField('excludePatterns', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className='mt-4 text-xs text-gray-500 dark:text-gray-400'>
        <p>{t('config.configSummary')}</p>
      </div>
    </div>
  );
};

export default ConfigTab;
