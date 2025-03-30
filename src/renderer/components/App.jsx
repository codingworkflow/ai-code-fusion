import React, { useState, useEffect } from 'react';
import TabBar from './TabBar';
import SourceTab from './SourceTab';
import ConfigTab from './ConfigTab';
import ProcessedTab from './ProcessedTab';
import yaml from 'yaml';

const App = () => {
  const [activeTab, setActiveTab] = useState('config');
  const [rootPath, setRootPath] = useState('');
  const [directoryTree, setDirectoryTree] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  // Load config from localStorage or via API, no fallbacks
  const [configContent, setConfigContent] = useState('# Loading configuration...');
  
  // Use effect to load config properly without fallbacks
  useEffect(() => {
    // First try to load from localStorage
    const savedConfig = localStorage.getItem('configContent');
    if (savedConfig) {
      setConfigContent(savedConfig);
      return;
    }
    
    // If not in localStorage, load from the main process
    if (window.electronAPI && window.electronAPI.getDefaultConfig) {
      window.electronAPI.getDefaultConfig()
        .then((defaultConfig) => {
          if (defaultConfig) {
            setConfigContent(defaultConfig);
            localStorage.setItem('configContent', defaultConfig);
          }
        })
        .catch((err) => {
          console.error('Error loading default config:', err);
        });
    }
  }, []);

  // Whenever configContent changes, save to localStorage
  useEffect(() => {
    localStorage.setItem('configContent', configContent);
  }, [configContent]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [processedResult, setProcessedResult] = useState(null);

  const handleTabChange = (tab) => {
    if (activeTab === tab) return; // Don't do anything if clicking the same tab

    // Save current tab configuration to localStorage for all components to access
    localStorage.setItem('configContent', configContent);

    // When switching tabs, try to do so with consistent state
    try {
      const config = yaml.parse(configContent);

      // Update processing options from config to maintain consistency
      setProcessingOptions({
        showTokenCount: config.show_token_count === true,
        includeTreeView: config.include_tree_view === true,
      });
    } catch (error) {
      console.error('Error parsing config when changing tabs:', error);
    }

    setActiveTab(tab);

    // If switching from config tab to source tab and we have a root path, refresh the directory tree
    // This allows the exclude patterns to be applied when the config is updated
    if (activeTab === 'config' && tab === 'source' && rootPath) {
      // Reset gitignore parser cache to ensure fresh parsing
      window.electronAPI.resetGitignoreCache && window.electronAPI.resetGitignoreCache();
      // refreshDirectoryTree now resets selection states and gets a fresh tree
      refreshDirectoryTree();
    }

    // Clear analysis and processed results when switching to source to select new files
    // But don't clear selections when switching from analyze to source
    if (tab === 'source' && activeTab !== 'analyze') {
      setAnalysisResult(null);
    }

    if (tab === 'source' && activeTab !== 'processed') {
      setProcessedResult(null);
    }
  };

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
      if (window.electronAPI.resetGitignoreCache) {
        await window.electronAPI.resetGitignoreCache();
      }

      // Get fresh directory tree
      const tree = await window.electronAPI.getDirectoryTree(rootPath, configContent);
      setDirectoryTree(tree);
    }
  };

  const handleDirectorySelect = async () => {
    const dirPath = await window.electronAPI.selectDirectory();

    if (dirPath) {
      // First reset selection states and analysis results
      setSelectedFiles([]);
      setSelectedFolders([]);
      setAnalysisResult(null);
      setProcessedResult(null);

      // Update rootPath
      setRootPath(dirPath);

      // Reset gitignore cache to ensure fresh parsing
      if (window.electronAPI.resetGitignoreCache) {
        await window.electronAPI.resetGitignoreCache();
      }

      // Get fresh directory tree
      const tree = await window.electronAPI.getDirectoryTree(dirPath, configContent);
      setDirectoryTree(tree);
    }
  };

  // Create state for processing options
  const [processingOptions, setProcessingOptions] = useState({
    showTokenCount: false,
    includeTreeView: false,
  });

  // Process files directly from Source to Processed Output
  const handleAnalyze = async () => {
    if (!rootPath || selectedFiles.length === 0) {
      alert('Please select a root directory and at least one file.');
      return Promise.reject(new Error('No directory or files selected'));
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
        return Promise.reject(new Error('No valid files selected'));
      }

      // Apply current config before analyzing
      const analysisResult = await window.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: validFiles, // Use validated files only
      });

      // Store analysis result
      setAnalysisResult(analysisResult);
      
      // Read options from config
      let options = {};
      try {
        const config = yaml.parse(configContent);
        options.showTokenCount = config.show_token_count === true;
        options.includeTreeView = config.include_tree_view === true;
      } catch (error) {
        console.error('Error parsing config for processing:', error);
      }
      
      // Process directly without going to analyze tab
      const result = await window.electronAPI.processRepository({
        rootPath,
        filesInfo: analysisResult.filesInfo,
        treeView: null, // Let the main process handle tree generation
        options,
      });
      
      // Set processed result and go directly to processed tab
      setProcessedResult(result);
      setActiveTab('processed');
      
      return Promise.resolve(analysisResult);
    } catch (error) {
      console.error('Error processing repository:', error);
      alert(`Error processing repository: ${error.message}`);
      return Promise.reject(error);
    }
  };

  // Helper function for consistent path normalization
  const normalizeAndGetRelativePath = (filePath) => {
    if (!filePath || !rootPath) return '';

    // Get path relative to root
    const relativePath = filePath.replace(rootPath, '').replace(/\\/g, '/').replace(/^\/+/, '');

    return relativePath;
  };

  // Helper function to generate tree view of selected files
  const generateTreeView = () => {
    if (!selectedFiles.length) return '';

    // Create a mapping of paths to help build the tree
    const pathMap = new Map();

    // Process selected files to build a tree structure
    selectedFiles.forEach((filePath) => {
      // Get relative path using the consistent normalization function
      const relativePath = normalizeAndGetRelativePath(filePath);

      if (!relativePath) {
        console.warn(`Skipping invalid path: ${filePath}`);
        return;
      }

      const parts = relativePath.split('/');

      // Build tree structure
      let currentPath = '';
      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const prevPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!pathMap.has(currentPath)) {
          pathMap.set(currentPath, {
            name: part,
            path: currentPath,
            isFile,
            children: [],
            level: index,
          });

          // Add to parent's children
          if (prevPath) {
            const parent = pathMap.get(prevPath);
            if (parent) {
              parent.children.push(pathMap.get(currentPath));
            }
          }
        }
      });
    });

    // Find root nodes (level 0)
    const rootNodes = Array.from(pathMap.values()).filter((node) => node.level === 0);

    // Recursive function to render tree
    const renderTree = (node, prefix = '', isLast = true) => {
      const linePrefix = prefix + (isLast ? '└── ' : '├── ');
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      let result = linePrefix;

      // Just add the name without icons
      result += node.name + '\n';

      // Sort children: folders first, then files, both alphabetically
      const sortedChildren = [...node.children].sort((a, b) => {
        if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      // Render children
      sortedChildren.forEach((child) => {
        // Don't create circular reference that could cause stack overflow
        const isChildLast = sortedChildren.indexOf(child) === sortedChildren.length - 1;
        result += renderTree(child, childPrefix, isChildLast);
      });

      return result;
    };

    // Generate the tree text without mentioning the root path
    let treeText = '';
    rootNodes.forEach((node, index) => {
      const isLastRoot = index === rootNodes.length - 1;
      treeText += renderTree(node, '', isLastRoot);
    });

    return treeText;
  };

  // Method to process from the Analyze tab
  const handleProcessDirect = async (treeViewData = null, options = {}) => {
    try {
      if (!analysisResult) {
        throw new Error('No analysis results available');
      }

      // Try to get the latest options from config
      try {
        const configContent = localStorage.getItem('configContent');
        if (configContent) {
          const config = yaml.parse(configContent);
          // If options not explicitly provided, use config defaults
          if (options.includeTreeView === undefined && config.include_tree_view !== undefined) {
            options.includeTreeView = config.include_tree_view;
          }
          if (options.showTokenCount === undefined && config.show_token_count !== undefined) {
            options.showTokenCount = config.show_token_count;
          }
        }
      } catch (error) {
        console.error('Error getting config defaults for processing:', error);
      }

      // Store processing options
      setProcessingOptions({ ...processingOptions, ...options });

      // Let the main process handle tree view generation for consistency
      const treeViewForProcess = null;

      const result = await window.electronAPI.processRepository({
        rootPath,
        filesInfo: analysisResult.filesInfo,
        treeView: treeViewForProcess,
        options,
      });

      setProcessedResult(result);
      setActiveTab('processed');
      return result;
    } catch (error) {
      console.error('Error processing repository:', error);
      alert(`Error processing repository: ${error.message}`);
      throw error;
    }
  };

  // Method to reload and reprocess files with the latest content
  const handleRefreshProcessed = async () => {
    try {
      // First check if we have valid selections
      if (!rootPath || selectedFiles.length === 0) {
        alert('No files are selected for processing. Please go to the Source tab and select files.');
        return null;
      }
      
      console.log('Reloading and processing files...');

      // Run a fresh analysis to re-read all files from disk
      const reanalysisResult = await window.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: selectedFiles,
      });
      
      // Update our state with the fresh analysis
      setAnalysisResult(reanalysisResult);
      
      // Get the latest config options
      let options = { ...processingOptions };
      try {
        const configStr = localStorage.getItem('configContent');
        if (configStr) {
          const config = yaml.parse(configStr);
          options.showTokenCount = config.show_token_count === true;
          options.includeTreeView = config.include_tree_view === true;
        }
      } catch (error) {
        console.error('Error parsing config for refresh:', error);
      }
      
      console.log('Processing with fresh analysis and options:', options);
      
      // Process with the fresh analysis
      const result = await window.electronAPI.processRepository({
        rootPath,
        filesInfo: reanalysisResult.filesInfo,
        treeView: null, // Let server generate
        options,
      });
      
      // Update the result and stay on the processed tab
      setProcessedResult(result);
      return result;
    } catch (error) {
      console.error('Error refreshing processed content:', error);
      alert(`Error refreshing processed content: ${error.message}`);
      throw error;
    }
  };

  const handleSaveOutput = async () => {
    if (!processedResult) {
      alert('No processed content to save.');
      return;
    }

    try {
      await window.electronAPI.saveFile({
        content: processedResult.content,
        defaultPath: `${rootPath}/output.md`,
      });
    } catch (error) {
      console.error('Error saving file:', error);
      alert(`Error saving file: ${error.message}`);
    }
  };

  // Utility function for path validation
  const isValidFilePath = (filePath) => {
    // Check if file path exists and is within the current root path
    if (!filePath || !rootPath) return false;

    // Ensure the file is within the current root path
    return filePath.startsWith(rootPath);
  };

  const handleFileSelect = (filePath, isSelected) => {
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

  // Track selected folders separately from selected files
  const [selectedFolders, setSelectedFolders] = useState([]);

  const handleFolderSelect = (folderPath, isSelected) => {
    // Validate folder path before selection
    if (isSelected && (!folderPath || !rootPath || !folderPath.startsWith(rootPath))) {
      console.warn(`Attempted to select an invalid folder: ${folderPath}`);
      return;
    }

    // Find the folder in the directory tree
    const findFolder = (items, path) => {
      for (const item of items) {
        if (item.path === path) {
          return item;
        }

        if (item.type === 'directory' && item.children) {
          const found = findFolder(item.children, path);
          if (found) {
            return found;
          }
        }
      }

      return null;
    };

    // Get all sub-folders in the folder recursively
    const getAllSubFolders = (folder) => {
      if (!folder || !folder.children) return [];

      let folders = [];

      for (const item of folder.children) {
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
    const getAllFiles = (folder) => {
      if (!folder || !folder.children) return [];

      let files = [];

      for (const item of folder.children) {
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
    <div className='container mx-auto p-4'>
      <h1 className='mb-4 text-2xl font-bold'>AI Code Fusion</h1>

      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className='tab-content rounded border border-gray-300 bg-white p-4'>
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
  );
};

export default App;
