import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import yaml from 'yaml';

import { normalizeExportFormat } from '../../utils/export-format';
import i18n from '../i18n';

import { INITIAL_CONFIG_PLACEHOLDER, sanitizeConfigForStorage } from './utils/config-storage';
import { ensureError } from './utils/error-utils';
import { isPathWithinRootBoundary } from './utils/path-boundary';
import {
  collectFilesWithinBoundary,
  collectSubFoldersWithinBoundary,
  findFolderByPath,
} from './utils/tree-selection';

import type {
  AnalyzeRepositoryResult,
  ConfigObject,
  DirectoryTreeItem,
  ExportFormat,
  ProcessRepositoryResult,
  TabId,
} from '../../types/ipc';

type ProcessingOptions = {
  showTokenCount: boolean;
  includeTreeView: boolean;
  exportFormat: ExportFormat;
};

type AppError = {
  message: string;
  translationKey?: string;
  translationOptions?: Record<string, string | number>;
  timestamp: number;
};

type AppContextValue = {
  activeTab: TabId;
  rootPath: string;
  directoryTree: DirectoryTreeItem[];
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  processedResult: ProcessRepositoryResult | null;
  configContent: string;
  processingOptions: ProcessingOptions;
  appError: AppError | null;
  switchTab: (tab: TabId) => void;
  selectDirectory: () => Promise<boolean>;
  refreshDirectoryTree: () => Promise<void>;
  updateConfig: (config: string) => void;
  handleFileSelect: (filePath: string, isSelected: boolean) => void;
  handleFolderSelect: (folderPath: string, isSelected: boolean) => void;
  handleBatchSelect: (files: string[], folders: string[], isSelected: boolean) => void;
  handleAnalyze: () => Promise<AnalyzeRepositoryResult | undefined>;
  handleRefreshProcessed: () => Promise<ProcessRepositoryResult | null>;
  handleSaveOutput: () => Promise<void>;
  dismissError: () => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

type AppProviderProps = {
  children: React.ReactNode;
};

export const AppProvider = ({ children }: AppProviderProps) => {
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [rootPath, setRootPath] = useState('');
  const [directoryTree, setDirectoryTree] = useState<DirectoryTreeItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const analysisResultRef = useRef<AnalyzeRepositoryResult | null>(null);
  const [processedResult, setProcessedResult] = useState<ProcessRepositoryResult | null>(null);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    showTokenCount: true,
    includeTreeView: false,
    exportFormat: 'markdown',
  });
  const [configContent, setConfigContent] = useState(INITIAL_CONFIG_PLACEHOLDER);
  const [appError, setAppError] = useState<AppError | null>(null);
  const appWindow = globalThis as Window & typeof globalThis;
  const electronAPI = appWindow.electronAPI;

  const showError = useCallback(
    (
      error:
        | string
        | {
            translationKey: string;
            translationOptions?: Record<string, string | number>;
            message?: string;
          }
    ) => {
      if (typeof error === 'string') {
        setAppError({ message: error, timestamp: Date.now() });
        return;
      }

      setAppError({
        message: error.message ?? '',
        translationKey: error.translationKey,
        translationOptions: error.translationOptions,
        timestamp: Date.now(),
      });
    },
    []
  );

  const dismissError = useCallback(() => {
    setAppError(null);
  }, []);

  // Load config from localStorage or default config
  useEffect(() => {
    const savedConfig = localStorage.getItem('configContent');
    if (savedConfig) {
      setConfigContent(savedConfig);
    } else if (electronAPI?.getDefaultConfig) {
      electronAPI
        .getDefaultConfig?.()
        .then((defaultConfig) => {
          if (defaultConfig) {
            setConfigContent(defaultConfig);
            localStorage.setItem('configContent', sanitizeConfigForStorage(defaultConfig));
          }
        })
        .catch((err) => {
          console.error('Error loading config:', err);
        });
    }

    const savedRootPath = localStorage.getItem('rootPath');
    if (savedRootPath) {
      setRootPath(savedRootPath);
      if (electronAPI?.getDirectoryTree) {
        electronAPI
          .getDirectoryTree?.(savedRootPath, localStorage.getItem('configContent'))
          .then((tree) => {
            setDirectoryTree(tree ?? []);
          })
          .catch((err) => {
            console.error('Error loading directory tree:', err);
          });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- electronAPI is a stable preload bridge on globalThis
  }, []);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    if (configContent === INITIAL_CONFIG_PLACEHOLDER) {
      return;
    }
    localStorage.setItem('configContent', sanitizeConfigForStorage(configContent));
  }, [configContent]);

  const updateConfig = useCallback((config: string) => {
    setConfigContent(config);
  }, []);

  const resetSelectionAndAnalysisState = useCallback(() => {
    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
    analysisResultRef.current = null;
    setProcessedResult(null);
  }, []);

  const refreshDirectoryTree = useCallback(async () => {
    if (!rootPath) {
      return;
    }

    resetSelectionAndAnalysisState();

    try {
      const electronAPI = appWindow.electronAPI;
      if (!electronAPI?.getDirectoryTree) {
        throw new Error(i18n.t('errors.electronApiUnavailable'));
      }

      await electronAPI.resetGitignoreCache?.();
      const tree = await electronAPI.getDirectoryTree(rootPath, configContent);
      setDirectoryTree(tree ?? []);
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error refreshing directory tree:', processedError);
      showError({ translationKey: 'errors.directoryLoadFailed' });
    }
  }, [rootPath, configContent, appWindow, resetSelectionAndAnalysisState, showError]);

  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;

  const switchTab = useCallback((tab: TabId) => {
    if (activeTabRef.current === tab) return;

    setActiveTab(tab);

    try {
      if (configContent) {
        const config = (yaml.parse(configContent) || {}) as ConfigObject;
        setProcessingOptions({
          showTokenCount: config.show_token_count !== false,
          includeTreeView: config.include_tree_view === true,
          exportFormat: normalizeExportFormat(config.export_format),
        });
      }
    } catch (error) {
      console.error('Error parsing config when changing tabs:', error);
    }

    if (tab === 'source') {
      analysisResultRef.current = null;
      setProcessedResult(null);
    }
  }, [configContent]);

  // When switching from config to source, refresh tree with latest config
  const prevTabRef = useRef<TabId>('config');
  useEffect(() => {
    if (prevTabRef.current === 'config' && activeTab === 'source' && rootPath) {
      appWindow.electronAPI?.resetGitignoreCache?.();
      refreshDirectoryTree();
    }
    prevTabRef.current = activeTab;
  }, [activeTab, rootPath, refreshDirectoryTree, appWindow]);

  const selectDirectory = useCallback(async (): Promise<boolean> => {
    try {
      const electronAPI = appWindow.electronAPI;
      if (!electronAPI?.selectDirectory || !electronAPI?.getDirectoryTree) {
        throw new Error(i18n.t('errors.electronApiUnavailable'));
      }

      const dirPath = await electronAPI.selectDirectory();

      if (!dirPath) {
        return false;
      }

      resetSelectionAndAnalysisState();
      await electronAPI.resetGitignoreCache?.();
      const tree = await electronAPI.getDirectoryTree(dirPath, configContent);
      setRootPath(dirPath);
      localStorage.setItem('rootPath', dirPath);
      setDirectoryTree(tree ?? []);
      return true;
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error selecting directory:', processedError);
      showError({ translationKey: 'errors.directoryLoadFailed' });
      return false;
    }
  }, [appWindow, configContent, resetSelectionAndAnalysisState, showError]);

  const handleFileSelect = useCallback((filePath: string, isSelected: boolean) => {
    if (isSelected && !isPathWithinRootBoundary(filePath, rootPath)) {
      console.warn(`Attempted to select an invalid file: ${filePath}`);
      return;
    }

    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(filePath);
      } else {
        next.delete(filePath);
      }
      return next;
    });
  }, [rootPath]);

  const handleFolderSelect = useCallback((folderPath: string, isSelected: boolean) => {
    if (isSelected && !isPathWithinRootBoundary(folderPath, rootPath)) {
      console.warn(`Attempted to select an invalid folder: ${folderPath}`);
      return;
    }

    const folder = findFolderByPath(directoryTree, folderPath);

    if (folder) {
      const subFolders = collectSubFoldersWithinBoundary(folder, rootPath);
      const files = collectFilesWithinBoundary(folder, rootPath);

      if (isSelected) {
        setSelectedFolders((prev) => {
          const next = new Set(prev);
          next.add(folderPath);
          for (const f of subFolders) next.add(f);
          return next;
        });

        setSelectedFiles((prev) => {
          const next = new Set(prev);
          for (const f of files) next.add(f);
          return next;
        });
      } else {
        setSelectedFolders((prev) => {
          const next = new Set(prev);
          next.delete(folderPath);
          for (const f of subFolders) next.delete(f);
          return next;
        });

        setSelectedFiles((prev) => {
          const next = new Set(prev);
          for (const f of files) next.delete(f);
          return next;
        });
      }
    }
  }, [rootPath, directoryTree]);

  const handleBatchSelect = useCallback(
    (files: string[], folders: string[], isSelected: boolean) => {
      if (isSelected) {
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          for (const f of files) {
            if (isPathWithinRootBoundary(f, rootPath)) next.add(f);
          }
          return next;
        });
        setSelectedFolders((prev) => {
          const next = new Set(prev);
          for (const f of folders) {
            if (isPathWithinRootBoundary(f, rootPath)) next.add(f);
          }
          return next;
        });
      } else {
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          for (const f of files) next.delete(f);
          return next;
        });
        setSelectedFolders((prev) => {
          const next = new Set(prev);
          for (const f of folders) next.delete(f);
          return next;
        });
      }
    },
    [rootPath]
  );

  const handleAnalyze = useCallback(async (): Promise<AnalyzeRepositoryResult | undefined> => {
    const selectedFilesArray = [...selectedFiles];
    if (!rootPath || selectedFilesArray.length === 0) {
      showError({ translationKey: 'errors.selectRootAndFiles' });
      return undefined;
    }

    try {
      const validFiles = selectedFilesArray.filter((file) => {
        const withinRoot = isPathWithinRootBoundary(file, rootPath);
        if (!withinRoot) {
          console.warn(`Skipping file outside current root directory: ${file}`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) {
        showError({ translationKey: 'errors.noValidFiles' });
        return undefined;
      }

      if (!appWindow.electronAPI?.analyzeRepository || !appWindow.electronAPI?.processRepository) {
        throw new Error(i18n.t('errors.electronApiUnavailable'));
      }

      const currentAnalysisResult = await appWindow.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: validFiles,
      });

      analysisResultRef.current = currentAnalysisResult;

      const options: ProcessingOptions = {
        showTokenCount: true,
        includeTreeView: false,
        exportFormat: 'markdown',
      };
      try {
        const config = (yaml.parse(configContent) || {}) as ConfigObject;
        options.showTokenCount = config.show_token_count !== false;
        options.includeTreeView = config.include_tree_view === true;
        options.exportFormat = normalizeExportFormat(config.export_format);
      } catch (error) {
        console.error('Error parsing config for processing:', ensureError(error));
      }
      setProcessingOptions(options);

      const result = await appWindow.electronAPI.processRepository({
        rootPath,
        filesInfo: currentAnalysisResult.filesInfo ?? [],
        treeView: null,
        options,
      });

      if (!result) {
        console.error('Processing failed or returned invalid data:', result);
        throw new Error('Processing operation failed or did not return expected data.');
      }

      setProcessedResult(result);
      setActiveTab('processed');

      return currentAnalysisResult;
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error processing repository:', processedError);
      showError({ translationKey: 'errors.processingFailed' });
      throw processedError;
    }
  }, [selectedFiles, rootPath, configContent, appWindow, showError]);

  const handleRefreshProcessed = useCallback(async (): Promise<ProcessRepositoryResult | null> => {
    try {
      const selectedFilesArray = [...selectedFiles];
      if (!rootPath || selectedFilesArray.length === 0) {
        showError({ translationKey: 'errors.noFilesSelectedForProcessing' });
        return null;
      }

      if (!appWindow.electronAPI?.analyzeRepository || !appWindow.electronAPI?.processRepository) {
        throw new Error(i18n.t('errors.electronApiUnavailable'));
      }

      const currentReanalysisResult = await appWindow.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: selectedFilesArray,
      });

      analysisResultRef.current = currentReanalysisResult;

      const options: ProcessingOptions = { ...processingOptions };
      try {
        if (configContent) {
          const config = (yaml.parse(configContent) || {}) as ConfigObject;
          options.showTokenCount = config.show_token_count !== false;
          options.includeTreeView = config.include_tree_view === true;
          options.exportFormat = normalizeExportFormat(config.export_format);
        }
      } catch (error) {
        console.error('Error parsing config for refresh:', ensureError(error));
      }
      setProcessingOptions(options);

      const result = await appWindow.electronAPI.processRepository({
        rootPath,
        filesInfo: currentReanalysisResult.filesInfo ?? [],
        treeView: null,
        options,
      });

      if (!result) {
        console.error('Re-processing failed or returned invalid data:', result);
        throw new Error('Re-processing operation failed or did not return expected data.');
      }

      setProcessedResult(result);
      return result;
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error refreshing processed content:', processedError);
      showError({ translationKey: 'errors.refreshFailed' });
      throw processedError;
    }
  }, [selectedFiles, rootPath, configContent, appWindow, processingOptions, showError]);

  const handleSaveOutput = useCallback(async () => {
    if (!processedResult) {
      showError({ translationKey: 'errors.noProcessedContentToSave' });
      return;
    }

    try {
      const outputExtension = processedResult.exportFormat === 'xml' ? 'xml' : 'md';
      await appWindow.electronAPI?.saveFile?.({
        content: processedResult.content,
        defaultPath: `${rootPath}/output.${outputExtension}`,
      });
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error saving file:', processedError);
      showError({ translationKey: 'errors.saveFailed' });
    }
  }, [processedResult, appWindow, rootPath, showError]);

  const contextValue = useMemo(
    () => ({
      activeTab,
      rootPath,
      directoryTree,
      selectedFiles,
      selectedFolders,
      processedResult,
      configContent,
      processingOptions,
      appError,
      switchTab,
      selectDirectory,
      refreshDirectoryTree,
      updateConfig,
      handleFileSelect,
      handleFolderSelect,
      handleBatchSelect,
      handleAnalyze,
      handleRefreshProcessed,
      handleSaveOutput,
      dismissError,
    }),
    [
      activeTab,
      rootPath,
      directoryTree,
      selectedFiles,
      selectedFolders,
      processedResult,
      configContent,
      processingOptions,
      appError,
      switchTab,
      selectDirectory,
      refreshDirectoryTree,
      updateConfig,
      handleFileSelect,
      handleFolderSelect,
      handleBatchSelect,
      handleAnalyze,
      handleRefreshProcessed,
      handleSaveOutput,
      dismissError,
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
