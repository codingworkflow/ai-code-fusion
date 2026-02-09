import React, { useState, useEffect } from 'react';
import TabBar from './TabBar';
import SourceTab from './SourceTab';
import ConfigTab from './ConfigTab';
import ProcessedTab from './ProcessedTab';
import DarkModeToggle from './DarkModeToggle';
import { DarkModeProvider } from '../context/DarkModeContext';
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
  if (error instanceof Error) return error;
  return new Error(String(error));
};

type ProcessingOptions = {
  showTokenCount: boolean;
  includeTreeView: boolean;
  exportFormat: ExportFormat;
};

const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [rootPath, setRootPath] = useState('');
  const [directoryTree, setDirectoryTree] = useState<DirectoryTreeItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [, setAnalysisResult] = useState<AnalyzeRepositoryResult | null>(null);
  const [processedResult, setProcessedResult] = useState<ProcessRepositoryResult | null>(null);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    showTokenCount: false,
    includeTreeView: false,
    exportFormat: 'markdown',
  });
  // Load config from localStorage or via API, no fallbacks
  const [configContent, setConfigContent] = useState('# Loading configuration...');

  // Load config from localStorage or default config
  useEffect(() => {
    // First try to load from localStorage
    const savedConfig = localStorage.getItem('configContent');
    if (savedConfig) {
      setConfigContent(savedConfig);
    } else if (window.electronAPI?.getDefaultConfig) {
      // Otherwise load from the main process
      window.electronAPI
        .getDefaultConfig?.()
        .then((defaultConfig) => {
          if (defaultConfig) {
            setConfigContent(defaultConfig);
            localStorage.setItem('configContent', defaultConfig);
          }
        })
        .catch((err) => {
          console.error('Error loading config:', err);
        });
    }

    // Load rootPath from localStorage if available
    const savedRootPath = localStorage.getItem('rootPath');
    if (savedRootPath) {
      setRootPath(savedRootPath);
      // Load directory tree for the saved path
      if (window.electronAPI?.getDirectoryTree) {
        window.electronAPI
          .getDirectoryTree?.(savedRootPath, localStorage.getItem('configContent'))
          .then((tree) => {
            setDirectoryTree(tree ?? []);
          })
          .catch((err) => {
            console.error('Error loading directory tree:', err);
          });
      }
    }
  }, []);

  // Setup path change listener to keep all components in sync
  useEffect(() => {
    // Create a function to check for rootPath changes
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'rootPath' && event.newValue && event.newValue !== rootPath) {
        // Update our internal state with the new path
        setRootPath(event.newValue);
      }
    };

    // Add event listener for localStorage changes
    window.addEventListener('storage', handleStorageChange);

    // Create an interval to check localStorage directly (for cross-component updates)
    const pathSyncInterval = setInterval(() => {
      const currentStoredPath = localStorage.getItem('rootPath');
      if (currentStoredPath && currentStoredPath !== rootPath) {
        setRootPath(currentStoredPath);
      }
    }, 500);

    // Cleanup
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pathSyncInterval);
    };
  }, [rootPath]);

  // Whenever configContent changes, save to localStorage
  useEffect(() => {
    localStorage.setItem('configContent', configContent);
  }, [configContent]);

  const handleTabChange = (tab: TabId) => {
    if (activeTab === tab) return; // Don't do anything if clicking the same tab

    // Save current tab configuration to localStorage for all components to access
    localStorage.setItem('configContent', configContent);

    // When switching tabs, try to do so with consistent state
    try {
      const config = (yaml.parse(configContent) || {}) as ConfigObject;

      // Make sure arrays are initialized to avoid issues
      if (!config.include_extensions) config.include_extensions = [];
      if (!config.exclude_patterns) config.exclude_patterns = [];

      // Update processing options from config to maintain consistency
      setProcessingOptions({
        showTokenCount: config.show_token_count === true,
        includeTreeView: config.include_tree_view === true,
        exportFormat: normalizeExportFormat(config.export_format),
      });

      // Ensure we've saved any config changes before switching tabs
      localStorage.setItem('configContent', configContent);
    } catch (error) {
      console.error('Error parsing config when changing tabs:', error);
    }

    setActiveTab(tab);

    // If switching from config tab to source tab and we have a root path, refresh the directory tree
    // This allows the exclude patterns to be applied when the config is updated
    if (activeTab === 'config' && tab === 'source' && rootPath) {
      // Reset gitignore parser cache to ensure fresh parsing
      window.electronAPI?.resetGitignoreCache?.();
      // refreshDirectoryTree now resets selection states and gets a fresh tree
      refreshDirectoryTree();
    }

    // Clear analysis results when switching to source tab
    if (tab === 'source') {
      setAnalysisResult(null);
    }

    if (tab === 'source') {
      setProcessedResult(null);
    }
  };

  // Expose the tab change function for other components to use
  window.switchToTab = handleTabChange;

  // Function to refresh the directory tree with current config
  const refreshDirectoryTree = async () => {
    if (rootPath) {
      // Reset selection states completely
      setSelectedFiles([]);
      setSelectedFolders([]);

      // Reset analysis results to prevent stale data
      setAnalysisResult(null);
      setProcessedResult(null);

      // Reset gitignore cache to ensure fresh parsing
      await window.electronAPI?.resetGitignoreCache?.();

      // Get fresh directory tree
      const tree = await window.electronAPI?.getDirectoryTree?.(rootPath, configContent);
      setDirectoryTree(tree ?? []);
    }
  };

  // Expose the refreshDirectoryTree function to the window object for SourceTab to use
  window.refreshDirectoryTree = refreshDirectoryTree;

  const handleDirectorySelect = async () => {
    const dirPath = await window.electronAPI?.selectDirectory?.();

    if (dirPath) {
      // First reset selection states and analysis results
      setSelectedFiles([]);
      setSelectedFolders([]);
      setAnalysisResult(null);
      setProcessedResult(null);

      // Update rootPath and save to localStorage
      setRootPath(dirPath);
      localStorage.setItem('rootPath', dirPath);

      // Dispatch a custom event to notify all components of the path change
      window.dispatchEvent(new CustomEvent('rootPathChanged', { detail: dirPath }));

      // Reset gitignore cache to ensure fresh parsing
      await window.electronAPI?.resetGitignoreCache?.();

      // Get fresh directory tree
      const tree = await window.electronAPI?.getDirectoryTree?.(dirPath, configContent);
      setDirectoryTree(tree ?? []);
    }
  };

  // Process files directly from Source to Processed Output
  const handleAnalyze = async () => {
    if (!rootPath || selectedFiles.length === 0) {
      alert('Please select a root directory and at least one file.');
      throw new Error('No directory or files selected');
    }

    try {
      // Validate selected files before analysis
      const validFiles = selectedFiles.filter((file) => {
        const withinRoot = file.startsWith(rootPath);

        if (!withinRoot) {
          console.warn(`Skipping file outside current root directory: ${file}`);
          return false;
        }

        return true;
      });

      if (validFiles.length === 0) {
        alert(
          'No valid files selected for analysis. Please select files within the current directory.'
        );
        throw new Error('No valid files selected');
      }

      if (!window.electronAPI?.analyzeRepository || !window.electronAPI?.processRepository) {
        throw new Error('Electron API is not available.');
      }

      // Apply current config before analyzing
      const currentAnalysisResult = await window.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: validFiles, // Use validated files only
      });

      // Store analysis result
      setAnalysisResult(currentAnalysisResult);

      // Read options from config
      const options: ProcessingOptions = {
        showTokenCount: false,
        includeTreeView: false,
        exportFormat: 'markdown',
      };
      try {
        const config = (yaml.parse(configContent) || {}) as ConfigObject;
        options.showTokenCount = config.show_token_count === true;
        options.includeTreeView = config.include_tree_view === true;
        options.exportFormat = normalizeExportFormat(config.export_format);
      } catch (error) {
        console.error('Error parsing config for processing:', ensureError(error));
      }
      setProcessingOptions(options);

      // Process directly without going to analyze tab
      const result = await window.electronAPI.processRepository({
        rootPath,
        filesInfo: currentAnalysisResult.filesInfo ?? [],
        treeView: null, // Let the main process handle tree generation
        options,
      });

      // Check if the result is valid before using it
      if (!result) {
        console.error('Processing failed or returned invalid data:', result);
        throw new Error('Processing operation failed or did not return expected data.');
      }

      // Set processed result and go directly to processed tab
      setProcessedResult(result);
      setActiveTab('processed');

      return currentAnalysisResult;
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error processing repository:', processedError);
      alert(`Error processing repository: ${processedError.message}`);
      throw processedError;
    }
  };

  // Helper function for consistent path normalization (used by handleFolderSelect indirectly)
  // We'll just use inline path normalization where needed

  // Method to reload and reprocess files with the latest content
  const handleRefreshProcessed = async () => {
    try {
      // First check if we have valid selections
      if (!rootPath || selectedFiles.length === 0) {
        alert(
          'No files are selected for processing. Please go to the Source tab and select files.'
        );
        return null;
      }

      if (!window.electronAPI?.analyzeRepository || !window.electronAPI?.processRepository) {
        throw new Error('Electron API is not available.');
      }

      console.log('Reloading and processing files...');

      // Run a fresh analysis to re-read all files from disk
      const currentReanalysisResult = await window.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: selectedFiles,
      });

      // Update our state with the fresh analysis
      setAnalysisResult(currentReanalysisResult);

      // Get the latest config options
      const options: ProcessingOptions = { ...processingOptions };
      try {
        const configStr = localStorage.getItem('configContent');
        if (configStr) {
          const config = (yaml.parse(configStr) || {}) as ConfigObject;
          options.showTokenCount = config.show_token_count === true;
          options.includeTreeView = config.include_tree_view === true;
          options.exportFormat = normalizeExportFormat(config.export_format);
        }
      } catch (error) {
        console.error('Error parsing config for refresh:', ensureError(error));
      }
      setProcessingOptions(options);

      console.log('Processing with fresh analysis and options:', options);

      // Process with the fresh analysis
      const result = await window.electronAPI.processRepository({
        rootPath,
        filesInfo: currentReanalysisResult.filesInfo ?? [],
        treeView: null, // Let server generate
        options,
      });

      // Check if the result is valid before using it
      if (!result) {
        console.error('Re-processing failed or returned invalid data:', result);
        throw new Error('Re-processing operation failed or did not return expected data.');
      }

      // Update the result and stay on the processed tab
      setProcessedResult(result);
      return result;
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error refreshing processed content:', processedError);
      alert(`Error refreshing processed content: ${processedError.message}`);
      throw processedError;
    }
  };

  const handleSaveOutput = async () => {
    if (!processedResult) {
      alert('No processed content to save.');
      return;
    }

    try {
      const outputExtension = processedResult.exportFormat === 'xml' ? 'xml' : 'md';
      await window.electronAPI?.saveFile?.({
        content: processedResult.content,
        defaultPath: `${rootPath}/output.${outputExtension}`,
      });
    } catch (error) {
      const processedError = ensureError(error);
      console.error('Error saving file:', processedError);
      alert(`Error saving file: ${processedError.message}`);
    }
  };

  // Utility function for path validation
  const isValidFilePath = (filePath: string): boolean => {
    // Check if file path exists and is within the current root path
    if (!filePath || !rootPath) return false;

    // Ensure the file is within the current root path
    return filePath.startsWith(rootPath);
  };

  const handleFileSelect = (filePath: string, isSelected: boolean) => {
    // Validate file path before selection
    if (isSelected && !isValidFilePath(filePath)) {
      console.warn(`Attempted to select an invalid file: ${filePath}`);
      return;
    }

    if (isSelected) {
      setSelectedFiles((prev) => {
        // Avoid duplicates using Set
        return [...new Set([...prev, filePath])];
      });
    } else {
      setSelectedFiles((prev) => prev.filter((path) => path !== filePath));
    }
  };

  const handleFolderSelect = (folderPath: string, isSelected: boolean) => {
    // Validate folder path before selection
    if (isSelected && (!folderPath || !rootPath || !folderPath.startsWith(rootPath))) {
      console.warn(`Attempted to select an invalid folder: ${folderPath}`);
      return;
    }

    // Find the folder in the directory tree
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

    // Get all sub-folders in the folder recursively
    const getAllSubFolders = (folder: DirectoryTreeItem): string[] => {
      if (!folder.children) return [];

      let folders: string[] = [];

      for (const item of folder.children ?? []) {
        if (item.type === 'directory') {
          // Validate each folder is within current root
          if (item.path.startsWith(rootPath)) {
            folders.push(item.path);
            folders = [...folders, ...getAllSubFolders(item)];
          }
        }
      }

      return folders;
    };

    // Get all files in the folder recursively
    const getAllFiles = (folder: DirectoryTreeItem): string[] => {
      if (!folder.children) return [];

      let files: string[] = [];

      for (const item of folder.children ?? []) {
        if (item.type === 'file') {
          // Validate each file is within current root
          if (item.path.startsWith(rootPath)) {
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
      // Get all subfolders
      const subFolders = getAllSubFolders(folder);

      // Get all files
      const files = getAllFiles(folder);

      // Update selected folders state
      if (isSelected) {
        // Add this folder and all sub-folders
        setSelectedFolders((prev) => {
          const allFolders = [folderPath, ...subFolders];
          // Filter out duplicates
          return [...new Set([...prev, ...allFolders])];
        });

        // Add all files in this folder and sub-folders
        setSelectedFiles((prev) => {
          // Filter out duplicates
          return [...new Set([...prev, ...files])];
        });
      } else {
        // Remove this folder and all sub-folders
        setSelectedFolders((prev) =>
          prev.filter((path) => path !== folderPath && !subFolders.includes(path))
        );

        // Remove all files in this folder and sub-folders
        setSelectedFiles((prev) => prev.filter((path) => !files.includes(path)));
      }
    }
  };

  return (
    <DarkModeProvider>
      <div className='mx-auto flex h-screen w-full max-w-screen-2xl flex-col p-4'>
        {/* Tab navigation and content container */}
        <div className='flex min-h-0 w-full flex-1 flex-col border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 transition-colors duration-200'>
          {/* Tab Bar and title in the same row */}
          <div className='w-full border-b border-gray-300 dark:border-gray-700 flex justify-between items-center bg-gray-100 dark:bg-gray-800 transition-colors duration-200'>
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
            <div className='flex items-center pr-4 space-x-2'>
              <DarkModeToggle />
              <button
                onClick={() => {
                  window.electron?.shell?.openExternal?.(
                    'https://github.com/codingworkflow/ai-code-fusion'
                  );
                }}
                className='flex items-center hover:text-blue-700 dark:hover:text-blue-500 cursor-pointer bg-transparent border-0 text-gray-900 dark:text-gray-100'
                title='View on GitHub'
              >
                <div className='h-8 w-8 mr-2 flex items-center justify-center'>
                  {/* Using a direct reference to the icon in the renderer directory */}
                  <img
                    src='icon.png'
                    alt='AI Code Fusion'
                    className='h-8 w-8'
                    onError={(event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                      console.error('Failed to load icon.png');
                      const image = event.currentTarget;
                      image.style.display = 'none';
                      const fallbackIcon = image.nextElementSibling as HTMLElement | null;
                      if (fallbackIcon) {
                        fallbackIcon.style.display = 'block';
                      }
                    }}
                  />
                  {/* Fallback icon */}
                  <svg
                    style={{ display: 'none' }}
                    xmlns='http://www.w3.org/2000/svg'
                    className='h-7 w-7'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='#1E40AF'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={1.5}
                      d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                    />
                  </svg>
                </div>
                <div className='flex items-center'>
                  <h1 className='text-2xl font-bold dark:text-white'>AI Code Fusion</h1>
                  <svg
                    className='ml-2 w-5 h-5 text-gray-600 dark:text-gray-400'
                    fill='currentColor'
                    viewBox='0 0 24 24'
                    xmlns='http://www.w3.org/2000/svg'
                  >
                    <path d='M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z' />
                  </svg>
                </div>
              </button>
            </div>
          </div>

          {/* Tab content */}
          <div
            role='tabpanel'
            id={`tabpanel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            className='flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-800 p-4 border-t-0 text-gray-900 dark:text-gray-100 transition-colors duration-200'
          >
            {activeTab === 'config' && (
              <ConfigTab configContent={configContent} onConfigChange={setConfigContent} />
            )}

            {activeTab === 'source' && (
              <SourceTab
                rootPath={rootPath}
                directoryTree={directoryTree}
                selectedFiles={selectedFiles}
                selectedFolders={selectedFolders}
                onDirectorySelect={handleDirectorySelect}
                onFileSelect={handleFileSelect}
                onFolderSelect={handleFolderSelect}
                onAnalyze={handleAnalyze}
              />
            )}

            {activeTab === 'processed' && (
              <ProcessedTab
                processedResult={processedResult}
                onSave={handleSaveOutput}
                onRefresh={handleRefreshProcessed}
              />
            )}
          </div>
        </div>
      </div>
    </DarkModeProvider>
  );
};

export default App;
