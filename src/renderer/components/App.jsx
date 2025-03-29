import React, { useState } from 'react';
import TabBar from './TabBar';
import SourceTab from './SourceTab';
import ConfigTab from './ConfigTab';
import AnalyzeTab from './AnalyzeTab';
import ProcessedTab from './ProcessedTab';

// TODO: Path utilities should be imported from path-utils.js via preload.js
// This would require updating the preload.js file to expose these functions:
// 
// In preload.js:
// const { normalizePath, getRelativePath, isWithinRoot } = require('../utils/path-utils');
// contextBridge.exposeInMainWorld('electronAPI', {
//   ...existingAPIs,
//   pathUtils: {
//     normalizePath,
//     getRelativePath,
//     isWithinRoot
//   }
// });
//
// For now, we'll keep local implementation with appropriate documentation about the fix needed

const defaultConfig = `# Filtering options
use_custom_excludes: true
use_gitignore: true


# File extensions to include (with dot)
include_extensions:
  - .py
  - .ts
  - .js
  - .jsx
  - .tsx
  - .json
  - .md
  - .txt
  - .html
  - .css
  - .scss
  - .less
  - .ini
  - .yaml
  - .yml
  - .kt
  - .java
  - .go
  - .scm
  - .php
  - .rb
  - .c
  - .cpp
  - .h
  - .cs
  - .sql
  - .sh
  - .bat
  - .ps1
  - .xml
  - .config

# Patterns to exclude (using fnmatch syntax)
exclude_patterns:
  # Version Control
  - "**/.git/**"
  - "**/.svn/**"
  - "**/.hg/**"
  - "**/vocab.txt"
  - "**.onnx"
  - "**/test*.py"

  # Dependencies
  - "**/node_modules/**"
  - "**/venv/**"
  - "**/env/**"
  - "**/.venv/**"
  - "**/.github/**"
  - "**/vendor/**"
  - "**/website/**"

  # Build outputs
  - "**/test/**"
  - "**/dist/**"
  - "**/build/**"
  - "**/__pycache__/**"
  - "**/*.pyc"
  - "**/bundle.js"
  - "**/bundle.js.map"
  - "**/bundle.js.LICENSE.txt"
  - "**/index.js.map"
  - "**/output.css"

  # Config files
  - "**/.DS_Store"
  - "**/.env"
  - "**/package-lock.json"
  - "**/yarn.lock"
  - "**/.prettierrc"
  - "**/.prettierignore"
  - "**/.gitignore"
  - "**/.gitattributes"
  - "**/.npmrc"

  # Documentation
  - "**/LICENSE*"
  - "**/LICENSE.*"
  - "**/COPYING"
  - "**/CODE_OF**"
  - "**/CONTRIBUTING**"

  # Test files
  - "**/tests/**"
  - "**/test/**"
  - "**/__tests__/**"`;

const App = () => {
  const [activeTab, setActiveTab] = useState('config');
  const [rootPath, setRootPath] = useState('');
  const [directoryTree, setDirectoryTree] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [configContent, setConfigContent] = useState(defaultConfig);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [processedResult, setProcessedResult] = useState(null);

  const handleTabChange = (tab) => {
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
      
      // Return true to indicate successful refresh
      return true;
    }
    return false;
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
  const [processingOptions, setProcessingOptions] = useState({ showTokenCount: true });

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
      const result = await window.electronAPI.analyzeRepository({
        rootPath,
        configContent,
        selectedFiles: validFiles, // Use validated files only
      });

      setAnalysisResult(result);
      // Switch to analyze tab to show results
      setActiveTab('analyze');
      return Promise.resolve(result);
    } catch (error) {
      console.error('Error analyzing repository:', error);
      alert(`Error analyzing repository: ${error.message}`);
      return Promise.reject(error);
    }
  };

  // Helper function for consistent path normalization 
  // TODO: This should use window.electronAPI.pathUtils.normalizePath and getRelativePath
  // This duplicates functionality in path-utils.js
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

      // Store processing options
      setProcessingOptions({ ...processingOptions, ...options });

      // Generate tree view if requested but not provided
      const treeViewForProcess =
        treeViewData || (options.includeTreeView ? generateTreeView() : null);

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
  // TODO: This should use window.electronAPI.pathUtils.isWithinRoot
  // This duplicates functionality in path-utils.js
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
            onRefreshDirectory={refreshDirectoryTree}
          />
        )}

        {activeTab === 'analyze' && (
          <AnalyzeTab analysisResult={analysisResult} onProcess={handleProcessDirect} />
        )}

        {activeTab === 'processed' && (
          <ProcessedTab processedResult={processedResult} onSave={handleSaveOutput} />
        )}
      </div>
    </div>
  );
};

export default App;
