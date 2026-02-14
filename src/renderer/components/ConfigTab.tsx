import React, { useCallback, useEffect, useState } from 'react';
import yaml from 'yaml';

import { normalizeExportFormat } from '../../utils/export-format';
import { yamlArrayToPlainText } from '../../utils/formatters/list-formatter';
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

type ConfigStateSetters = {
  setFileExtensions: React.Dispatch<React.SetStateAction<string>>;
  setExcludePatterns: React.Dispatch<React.SetStateAction<string>>;
  setUseCustomExcludes: React.Dispatch<React.SetStateAction<boolean>>;
  setUseCustomIncludes: React.Dispatch<React.SetStateAction<boolean>>;
  setUseGitignore: React.Dispatch<React.SetStateAction<boolean>>;
  setEnableSecretScanning: React.Dispatch<React.SetStateAction<boolean>>;
  setExcludeSuspiciousFiles: React.Dispatch<React.SetStateAction<boolean>>;
  setIncludeTreeView: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTokenCount: React.Dispatch<React.SetStateAction<boolean>>;
  setExportFormat: React.Dispatch<React.SetStateAction<ExportFormat>>;
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
}): string[] => {
  if (!hasProviderInput(providerFields)) {
    return [];
  }

  const errors: string[] = [];
  const { providerId, providerModel, providerApiKey, providerBaseUrl } = providerFields;

  if (!providerId) {
    errors.push('Select a provider.');
  }

  if (!providerModel.trim()) {
    errors.push('Model is required.');
  }

  const selectedProviderOption = PROVIDER_OPTIONS.find(
    (providerOption) => providerOption.id === providerId
  );
  if (selectedProviderOption?.requiresApiKey && !providerApiKey.trim()) {
    errors.push('API key is required for this provider.');
  }

  if (providerBaseUrl.trim()) {
    try {
      const parsedUrl = new URL(providerBaseUrl.trim());
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push('Base URL must use http or https.');
      }
    } catch {
      errors.push('Base URL must be a valid URL.');
    }
  }

  return errors;
};

// Helper functions for extension and pattern handling to reduce complexity
const processExtensions = (
  config: ConfigObject,
  setFileExtensions: React.Dispatch<React.SetStateAction<string>>
) => {
  setFileExtensions(
    config?.include_extensions && Array.isArray(config.include_extensions)
      ? yamlArrayToPlainText(config.include_extensions)
      : ''
  );
};

const processPatterns = (
  config: ConfigObject,
  setExcludePatterns: React.Dispatch<React.SetStateAction<string>>
) => {
  setExcludePatterns(
    config?.exclude_patterns && Array.isArray(config.exclude_patterns)
      ? yamlArrayToPlainText(config.exclude_patterns)
      : ''
  );
};

// Helper function to update config-related states
const updateConfigStates = (config: ConfigObject, stateSetters: ConfigStateSetters) => {
  const {
    setFileExtensions,
    setExcludePatterns,
    setUseCustomExcludes,
    setUseCustomIncludes,
    setUseGitignore,
    setEnableSecretScanning,
    setExcludeSuspiciousFiles,
    setIncludeTreeView,
    setShowTokenCount,
    setExportFormat,
  } = stateSetters;

  // Process extensions and patterns
  processExtensions(config, setFileExtensions);
  processPatterns(config, setExcludePatterns);

  // Set checkbox states
  if (config?.use_custom_excludes !== undefined) {
    setUseCustomExcludes(config.use_custom_excludes !== false);
  }

  if (config?.use_custom_includes !== undefined) {
    setUseCustomIncludes(config.use_custom_includes !== false);
  }

  if (config?.use_gitignore !== undefined) {
    setUseGitignore(config.use_gitignore !== false);
  }

  if (config?.enable_secret_scanning !== undefined) {
    setEnableSecretScanning(config.enable_secret_scanning !== false);
  }

  if (config?.exclude_suspicious_files !== undefined) {
    setExcludeSuspiciousFiles(config.exclude_suspicious_files !== false);
  }

  if (config?.include_tree_view !== undefined) {
    setIncludeTreeView(config.include_tree_view === true);
  }

  if (config?.show_token_count !== undefined) {
    setShowTokenCount(config.show_token_count === true);
  }

  if (config?.export_format !== undefined) {
    setExportFormat(normalizeExportFormat(config.export_format));
  }
};

const ConfigTab = ({ configContent, onConfigChange }: ConfigTabProps) => {
  const [isSaved, setIsSaved] = useState(false);
  const [useCustomExcludes, setUseCustomExcludes] = useState(true);
  const [useCustomIncludes, setUseCustomIncludes] = useState(true);
  const [useGitignore, setUseGitignore] = useState(true);
  const [enableSecretScanning, setEnableSecretScanning] = useState(true);
  const [excludeSuspiciousFiles, setExcludeSuspiciousFiles] = useState(true);
  const [includeTreeView, setIncludeTreeView] = useState(true);
  const [showTokenCount, setShowTokenCount] = useState(true);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown');
  const [fileExtensions, setFileExtensions] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [providerId, setProviderId] = useState<ProviderId | ''>('');
  const [providerModel, setProviderModel] = useState('');
  const [providerApiKey, setProviderApiKey] = useState('');
  const [providerBaseUrl, setProviderBaseUrl] = useState('');
  const [providerValidationErrors, setProviderValidationErrors] = useState<string[]>([]);
  const [providerTestResult, setProviderTestResult] = useState<ProviderConnectionResult | null>(
    null
  );
  const [isTestingProviderConnection, setIsTestingProviderConnection] = useState(false);
  const appWindow = globalThis as Window & typeof globalThis;
  const aiSurfacesEnabled = isAiSurfacesEnabled();

  // Extract and set file extensions and exclude patterns sections
  useEffect(() => {
    try {
      // Parse the YAML config
      const config = (yaml.parse(configContent) || {}) as ConfigObject;

      // Use helper function to update states
      updateConfigStates(config, {
        setFileExtensions,
        setExcludePatterns,
        setUseCustomExcludes,
        setUseCustomIncludes,
        setUseGitignore,
        setEnableSecretScanning,
        setExcludeSuspiciousFiles,
        setIncludeTreeView,
        setShowTokenCount,
        setExportFormat,
      });

      if (aiSurfacesEnabled) {
        const providerConfig = config?.provider ?? {};
        setProviderId(isSupportedProviderId(providerConfig.id) ? providerConfig.id : '');
        setProviderModel(typeof providerConfig.model === 'string' ? providerConfig.model : '');
        setProviderApiKey(typeof providerConfig.api_key === 'string' ? providerConfig.api_key : '');
        setProviderBaseUrl(
          typeof providerConfig.base_url === 'string' ? providerConfig.base_url : ''
        );
      } else {
        setProviderId('');
        setProviderModel('');
        setProviderApiKey('');
        setProviderBaseUrl('');
      }

      setProviderValidationErrors([]);
      setProviderTestResult(null);
    } catch (error) {
      console.error('Error parsing config:', error);
    }
  }, [aiSurfacesEnabled, configContent]);

  // Auto-save function whenever options change or manual save
  const saveConfig = useCallback(() => {
    try {
      let config: ConfigObject;

      try {
        // Parse the current config
        config = yaml.parse(configContent) as ConfigObject;
        // If parsing returns null or undefined, use empty object
        if (!config) {
          config = {};
        }
      } catch (error) {
        console.error('Error parsing config content, using empty config:', error);
        config = {};
      }

      // Update with current values
      config.use_custom_excludes = useCustomExcludes;
      config.use_custom_includes = useCustomIncludes;
      config.use_gitignore = useGitignore;
      config.enable_secret_scanning = enableSecretScanning;
      config.exclude_suspicious_files = excludeSuspiciousFiles;
      config.include_tree_view = includeTreeView;
      config.show_token_count = showTokenCount;
      config.export_format = exportFormat;

      // Process file extensions from the textarea
      config.include_extensions = fileExtensions
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // Process exclude patterns from the textarea
      config.exclude_patterns = excludePatterns
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      let hasProviderValidationErrors = false;
      if (aiSurfacesEnabled) {
        const providerFields = {
          providerId,
          providerModel,
          providerApiKey,
          providerBaseUrl,
        };
        const validationErrors = getProviderValidationErrors(providerFields);
        hasProviderValidationErrors = validationErrors.length > 0;

        if (hasProviderValidationErrors) {
          setProviderValidationErrors(validationErrors);
          setProviderTestResult({
            ok: false,
            message: 'Fix provider settings before saving.',
          });
          if (config.provider) {
            delete config.provider;
          }
        } else if (hasProviderInput(providerFields) && providerId) {
          config.provider = {
            id: providerId,
            model: providerModel.trim(),
            api_key: trimToUndefined(providerApiKey),
            base_url: trimToUndefined(providerBaseUrl),
          };
        } else if (config.provider) {
          delete config.provider;
        }
      } else {
        setProviderValidationErrors([]);
        setProviderTestResult(null);
      }

      // Convert back to YAML and save
      const updatedConfig = yaml.stringify(config);
      onConfigChange(updatedConfig);

      if (hasProviderValidationErrors) {
        setIsSaved(false);
      } else {
        // Show saved indicator
        setProviderValidationErrors([]);
        setIsSaved(true);
        setTimeout(() => {
          setIsSaved(false);
        }, 1500);
      }
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Error updating configuration. Please check the YAML syntax.');
    }
  }, [
    configContent,
    useCustomExcludes,
    useCustomIncludes,
    useGitignore,
    enableSecretScanning,
    excludeSuspiciousFiles,
    includeTreeView,
    showTokenCount,
    exportFormat,
    fileExtensions,
    excludePatterns,
    aiSurfacesEnabled,
    providerId,
    providerModel,
    providerApiKey,
    providerBaseUrl,
    onConfigChange,
  ]);

  // Auto-save whenever any option changes, but with a small delay to prevent
  // circular updates and rapid toggling
  useEffect(() => {
    const timer = setTimeout(saveConfig, 50);
    return () => clearTimeout(timer);
  }, [
    useCustomExcludes,
    useCustomIncludes,
    useGitignore,
    enableSecretScanning,
    excludeSuspiciousFiles,
    includeTreeView,
    showTokenCount,
    exportFormat,
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
        message: 'Provider connection testing is disabled outside dev mode.',
      });
      return;
    }

    const providerFields = {
      providerId,
      providerModel,
      providerApiKey,
      providerBaseUrl,
    };
    const validationErrors = getProviderValidationErrors(providerFields);
    if (validationErrors.length > 0) {
      setProviderValidationErrors(validationErrors);
      setProviderTestResult({
        ok: false,
        message: 'Fix provider settings before testing the connection.',
      });
      return;
    }

    if (!providerId) {
      setProviderValidationErrors(['Select a provider.']);
      return;
    }

    if (!appWindow.electronAPI?.testProviderConnection) {
      setProviderTestResult({
        ok: false,
        message: 'Provider connection testing is unavailable in this build.',
      });
      return;
    }

    setIsTestingProviderConnection(true);
    setProviderTestResult(null);

    try {
      const result = await appWindow.electronAPI.testProviderConnection({
        providerId,
        model: providerModel.trim(),
        apiKey: providerApiKey.trim(),
        baseUrl: trimToUndefined(providerBaseUrl),
      });
      setProviderTestResult(result);
      if (result.ok) {
        setProviderValidationErrors([]);
      }
    } catch (error) {
      setProviderTestResult({
        ok: false,
        message: `Connection test failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      });
    } finally {
      setIsTestingProviderConnection(false);
    }
  };

  // State to track the current folder path
  const [folderPath, setFolderPath] = useState<string>(localStorage.getItem('rootPath') || '');

  // Listen for path changes from other components
  useEffect(() => {
    // Function to update our path when localStorage changes
    const checkForPathChanges = () => {
      const currentPath = localStorage.getItem('rootPath');
      if (currentPath && currentPath !== folderPath) {
        setFolderPath(currentPath);
      }
    };

    // Check immediately
    checkForPathChanges();

    // Setup interval to check for changes
    const pathCheckInterval = setInterval(checkForPathChanges, 500);

    // Listen for custom events
    const handleRootPathChanged = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const detail = customEvent.detail;
      if (detail && detail !== folderPath) {
        setFolderPath(detail);
      }
    };

    appWindow.addEventListener('rootPathChanged', handleRootPathChanged);

    return () => {
      clearInterval(pathCheckInterval);
      appWindow.removeEventListener('rootPathChanged', handleRootPathChanged);
    };
  }, [folderPath, appWindow]);

  // Handle folder selection
  const handleFolderSelect = async () => {
    if (appWindow.electronAPI?.selectDirectory) {
      const dirPath = await appWindow.electronAPI.selectDirectory?.();
      if (dirPath) {
        // Store the selected path in localStorage for use across the app
        localStorage.setItem('rootPath', dirPath);
        setFolderPath(dirPath);

        // Dispatch a custom event to notify other components
        appWindow.dispatchEvent(new CustomEvent('rootPathChanged', { detail: dirPath }));

        // Automatically switch to Select Files tab
        setTimeout(() => {
          goToSourceTab();
        }, 500);
      }
    }
  };

  const goToSourceTab = () => {
    // Switch to the Source tab
    if (appWindow.switchToTab) {
      appWindow.switchToTab('source');
    }
  };

  return (
    <div>
      {/* Folder selector */}
      <div className='mb-4'>
        <div className='flex'>
          <input
            type='text'
            className='grow border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 cursor-pointer'
            value={folderPath}
            readOnly
            placeholder='Select a root folder'
            onClick={handleFolderSelect}
            title='Click to browse for a directory'
          />
          <button
            onClick={handleFolderSelect}
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
            Select Folder
          </button>
        </div>
      </div>

      <div className='mb-4'>
        <div className='rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-2'>
            {/* File Filtering section */}
            <div className='rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                File Filtering
              </h4>

              <div className='space-y-2'>
                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-custom-includes'
                    checked={useCustomIncludes}
                    onChange={(e) => setUseCustomIncludes(e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='use-custom-includes'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Filter by file extensions
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-custom-excludes'
                    checked={useCustomExcludes}
                    onChange={(e) => setUseCustomExcludes(e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='use-custom-excludes'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Use exclude patterns
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-gitignore'
                    checked={useGitignore}
                    onChange={(e) => setUseGitignore(e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='use-gitignore'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Apply .gitignore rules
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='enable-secret-scanning'
                    checked={enableSecretScanning}
                    onChange={(e) => setEnableSecretScanning(e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='enable-secret-scanning'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Scan content for secrets
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='exclude-suspicious-files'
                    checked={excludeSuspiciousFiles}
                    onChange={(e) => setExcludeSuspiciousFiles(e.target.checked)}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label
                    htmlFor='exclude-suspicious-files'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Exclude suspicious files
                  </label>
                </div>
              </div>
            </div>

            {/* Output Formatting section */}
            <div className='rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                Output Formatting
              </h4>

              <div className='space-y-2'>
                <div className='flex items-center'>
                  <input
                    id='include-tree-view'
                    type='checkbox'
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    checked={includeTreeView}
                    onChange={(e) => setIncludeTreeView(e.target.checked)}
                  />
                  <label
                    htmlFor='include-tree-view'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Include file tree in output
                  </label>
                </div>

                <div className='flex items-center'>
                  <input
                    id='show-token-count'
                    type='checkbox'
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    checked={showTokenCount}
                    onChange={(e) => setShowTokenCount(e.target.checked)}
                  />
                  <label
                    htmlFor='show-token-count'
                    className='ml-2 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Display token counts
                  </label>
                </div>

                <div>
                  <label
                    htmlFor='export-format'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Export format
                  </label>
                  <select
                    id='export-format'
                    value={exportFormat}
                    onChange={(event) => setExportFormat(normalizeExportFormat(event.target.value))}
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  >
                    <option value='markdown'>Markdown</option>
                    <option value='xml'>XML</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {aiSurfacesEnabled && (
            <div className='rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 p-4 mt-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300'>
                Provider Setup Assistant
              </h4>
              <p className='mb-3 text-xs text-gray-500 dark:text-gray-400'>
                Configure a model provider and run a connection test before saving.
              </p>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                <div>
                  <label
                    htmlFor='provider-id'
                    className='mb-1 block text-sm text-gray-700 dark:text-gray-300'
                  >
                    Provider
                  </label>
                  <select
                    id='provider-id'
                    value={providerId}
                    onChange={(event) => {
                      setProviderId(
                        isSupportedProviderId(event.target.value) ? event.target.value : ''
                      );
                      resetProviderFeedback();
                    }}
                    className='w-full rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
                  >
                    <option value=''>Select provider</option>
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
                    Model
                  </label>
                  <input
                    id='provider-model'
                    type='text'
                    value={providerModel}
                    placeholder='e.g. gpt-4o-mini'
                    onChange={(event) => {
                      setProviderModel(event.target.value);
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
                    Base URL (optional)
                  </label>
                  <input
                    id='provider-base-url'
                    type='text'
                    value={providerBaseUrl}
                    placeholder={
                      PROVIDER_OPTIONS.find((providerOption) => providerOption.id === providerId)
                        ?.defaultBaseUrl || 'https://api.openai.com/v1'
                    }
                    onChange={(event) => {
                      setProviderBaseUrl(event.target.value);
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
                    API key (optional for Ollama)
                  </label>
                  <input
                    id='provider-api-key'
                    type='password'
                    value={providerApiKey}
                    placeholder='Enter provider API key'
                    onChange={(event) => {
                      setProviderApiKey(event.target.value);
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
                  {isTestingProviderConnection ? 'Testing...' : 'Test Connection'}
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
            Changes are automatically saved and will be applied when switching to the Source tab.
            Token count estimates help with optimizing context for large repositories.
          </p>
        </div>
      </div>

      <div className='mb-4'>
        <div className='mb-1 flex items-center justify-end'>
          <button
            onClick={saveConfig}
            className='inline-flex items-center border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none'
          >
            {isSaved ? '✓ Saved' : 'Save Config'}
          </button>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700 dark:text-gray-300'>
              Only process files with these extensions
            </h4>
            <p className='text-xs text-gray-500 dark:text-gray-400 mb-1'>
              One extension per line (include the dot)
            </p>
            <textarea
              className='h-44 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={fileExtensions}
              placeholder='.py
.js
.jsx
.ts
.tsx'
              onChange={(e) => setFileExtensions(e.target.value)}
            />
          </div>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700 dark:text-gray-300'>
              Exclude Patterns
            </h4>
            <p className='text-xs text-gray-500 dark:text-gray-400 mb-1'>
              One pattern per line (using glob pattern)
            </p>
            <textarea
              className='h-44 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={excludePatterns}
              placeholder='**/.git/**
**/node_modules/**
**/dist/**
**/build/**'
              onChange={(e) => setExcludePatterns(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className='mt-4 text-xs text-gray-500 dark:text-gray-400'>
        <p>Configure which file types to include and patterns to exclude in the analysis.</p>
      </div>
    </div>
  );
};

export default ConfigTab;
