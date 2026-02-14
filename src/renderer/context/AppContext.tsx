import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import yaml from 'yaml';

import { normalizeExportFormat } from '../../utils/export-format';

import type {
  AnalyzeRepositoryResult,
  ConfigObject,
  DirectoryTreeItem,
  ExportFormat,
  ProcessRepositoryResult,
  TabId,
} from '../../types/ipc';

// Helper function to ensure consistent error handling
const ensureError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return new Error(String(error));
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('Unknown error');
    }
  }

  return new Error('Unknown error');
};

type ProcessingOptions = {
  showTokenCount: boolean;
  includeTreeView: boolean;
  exportFormat: ExportFormat;
};

type AppError = {
  message: string;
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

const sanitizeConfigForStorage = (configContent: string): string => {
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

const normalizePathForBoundaryCheck = (inputPath: string): string => {
  const normalizedSlashes = inputPath.replaceAll('\\', '/');
  const driveMatch = /^[A-Za-z]:/.exec(normalizedSlashes);
  const drivePrefix = driveMatch ? driveMatch[0].toLowerCase() : '';
  const pathWithoutDrive = drivePrefix ? normalizedSlashes.slice(2) : normalizedSlashes;
  const hasLeadingSlash = pathWithoutDrive.startsWith('/');

  const segments = pathWithoutDrive.split('/').filter((segment) => segment && segment !== '.');
  const resolvedSegments: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      if (resolvedSegments.length > 0 && resolvedSegments.at(-1) !== '..') {
        resolvedSegments.pop();
      } else if (!hasLeadingSlash) {
        resolvedSegments.push('..');
      }
      continue;
    }

    resolvedSegments.push(segment);
  }

  return `${drivePrefix}${hasLeadingSlash ? '/' : ''}${resolvedSegments.join('/')}`;
};

const isPathWithinRootBoundary = (candidatePath: string, rootPath: string): boolean => {
  if (!candidatePath || !rootPath) {
    return false;
  }

  const normalizedRootPath = normalizePathForBoundaryCheck(rootPath);
  const normalizedCandidatePath = normalizePathForBoundaryCheck(candidatePath);

  return (
    normalizedCandidatePath === normalizedRootPath ||
    normalizedCandidatePath.startsWith(`${normalizedRootPath}/`)
  );
};

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
  const [configContent, setConfigContent] = useState('# Loading configuration...');
  const [appError, setAppError] = useState<AppError | null>(null);
  const appWindow = globalThis as Window & typeof globalThis;
  const electronAPI = appWindow.electronAPI;

  const showError = useCallback((message: string) => {
    setAppError({ message, timestamp: Date.now() });
  }, []);

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
    localStorage.setItem('configContent', sanitizeConfigForStorage(configContent));
  }, [configContent]);

  const updateConfig = useCallback((config: string) => {
    setConfigContent(config);
  }, []);

  const refreshDirectoryTree = useCallback(async () => {
    if (rootPath) {
      setSelectedFiles(new Set());
      setSelectedFolders(new Set());
      analysisResultRef.current = null;
      setProcessedResult(null);
      await appWindow.electronAPI?.resetGitignoreCache?.();
      const tree = await appWindow.electronAPI?.getDirectoryTree?.(rootPath, configContent);
      setDirectoryTree(tree ?? []);
    }
  }, [rootPath, configContent, appWindow]);

  const activeTabRef = useRef<TabId>(activeTab);
  activeTabRef.current = activeTab;

  const switchTab = useCallback((tab: TabId) => {
    if (activeTabRef.current === tab) return;

    setActiveTab(tab);

    try {
      const savedConfig = localStorage.getItem('configContent');
      if (savedConfig) {
        const config = (yaml.parse(savedConfig) || {}) as ConfigObject;
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
  }, []);

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
    const dirPath = await appWindow.electronAPI?.selectDirectory?.();

    if (!dirPath) {
      return false;
    }

    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
    analysisResultRef.current = null;
    setProcessedResult(null);
    setRootPath(dirPath);
    localStorage.setItem('rootPath', dirPath);
    await appWindow.electronAPI?.resetGitignoreCache?.();
    const tree = await appWindow.electronAPI?.getDirectoryTree?.(dirPath, configContent);
    setDirectoryTree(tree ?? []);
    return true;
  }, [appWindow, configContent]);

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

    const findFolder = (
      items: DirectoryTreeItem[] | undefined,
      targetPath: string
    ): DirectoryTreeItem | null => {
      for (const item of items ?? []) {
        if (item.path === targetPath) {
          return item;
        }

        if (item.type === 'directory' && item.children) {
          const found = findFolder(item.children, targetPath);
          if (found) {
            return found;
          }
        }
      }

      return null;
    };

    const getAllSubFolders = (folder: DirectoryTreeItem): string[] => {
      if (!folder.children) return [];

      let folders: string[] = [];

      for (const item of folder.children ?? []) {
        if (item.type === 'directory' && isPathWithinRootBoundary(item.path, rootPath)) {
          folders.push(item.path, ...getAllSubFolders(item));
        }
      }

      return folders;
    };

    const getAllFiles = (folder: DirectoryTreeItem): string[] => {
      if (!folder.children) return [];

      let files: string[] = [];

      for (const item of folder.children ?? []) {
        if (item.type === 'file') {
          if (isPathWithinRootBoundary(item.path, rootPath)) {
            files.push(item.path);
          }
        } else if (item.type === 'directory') {
          files = [...files, ...getAllFiles(item)];
        }
      }

      return files;
    };

    const folder = findFolder(directoryTree, folderPath);

    if (folder) {
      const subFolders = getAllSubFolders(folder);
      const files = getAllFiles(folder);

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
      showError('Please select a root directory and at least one file.');
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
        showError(
          'No valid files selected for analysis. Please select files within the current directory.'
        );
        return undefined;
      }

      if (!appWindow.electronAPI?.analyzeRepository || !appWindow.electronAPI?.processRepository) {
        throw new Error('Electron API is not available.');
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
      showError('An error occurred while processing the repository. Check the console for details.');
      throw processedError;
    }
  }, [selectedFiles, rootPath, configContent, appWindow, showError]);

  const handleRefreshProcessed = useCallback(async (): Promise<ProcessRepositoryResult | null> => {
    try {
      const selectedFilesArray = [...selectedFiles];
      if (!rootPath || selectedFilesArray.length === 0) {
        showError(
          'No files are selected for processing. Please go to the Source tab and select files.'
        );
        return null;
      }

      if (!appWindow.electronAPI?.analyzeRepository || !appWindow.electronAPI?.processRepository) {
        throw new Error('Electron API is not available.');
      }

      const currentReanalysisResult = await appWindow.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: selectedFilesArray,
      });

      analysisResultRef.current = currentReanalysisResult;

      const options: ProcessingOptions = { ...processingOptions };
      try {
        const configStr = localStorage.getItem('configContent');
        if (configStr) {
          const config = (yaml.parse(configStr) || {}) as ConfigObject;
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
      showError('An error occurred while refreshing content. Check the console for details.');
      throw processedError;
    }
  }, [selectedFiles, rootPath, configContent, appWindow, processingOptions, showError]);

  const handleSaveOutput = useCallback(async () => {
    if (!processedResult) {
      showError('No processed content to save.');
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
      showError('An error occurred while saving the file. Check the console for details.');
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
