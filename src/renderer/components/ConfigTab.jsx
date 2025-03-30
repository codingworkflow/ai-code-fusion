import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import yaml from 'yaml';
import { yamlArrayToPlainText, plainTextToYamlArray } from '../../utils/formatters/list-formatter';

const ConfigTab = ({ configContent, onConfigChange }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [useCustomExcludes, setUseCustomExcludes] = useState(true);
  const [useCustomIncludes, setUseCustomIncludes] = useState(true);
  const [useGitignore, setUseGitignore] = useState(true);
  const [includeTreeView, setIncludeTreeView] = useState(true);
  const [showTokenCount, setShowTokenCount] = useState(true);
  const [fileExtensions, setFileExtensions] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');

  // Extract and set file extensions and exclude patterns sections
  useEffect(() => {
    try {
      // Parse the YAML config
      const config = yaml.parse(configContent) || {};
      
      // Convert arrays to plain text format for easier editing
      if (config && config.include_extensions && Array.isArray(config.include_extensions)) {
        setFileExtensions(yamlArrayToPlainText(config.include_extensions));
      } else {
        setFileExtensions('');
      }
      
      // Convert exclude patterns to plain text
      if (config && config.exclude_patterns && Array.isArray(config.exclude_patterns)) {
        setExcludePatterns(yamlArrayToPlainText(config.exclude_patterns));
      } else {
        setExcludePatterns('');
      }
      
      // Set checkbox states from the same config object only if they're different
      // This prevents unnecessary re-renders and blinking checkboxes
      if (config && config.use_custom_excludes !== undefined && useCustomExcludes !== (config.use_custom_excludes !== false)) {
        setUseCustomExcludes(config.use_custom_excludes !== false);
      }
      
      if (config && config.use_custom_includes !== undefined && useCustomIncludes !== (config.use_custom_includes !== false)) {
        setUseCustomIncludes(config.use_custom_includes !== false);
      }
      
      if (config && config.use_gitignore !== undefined && useGitignore !== (config.use_gitignore !== false)) {
        setUseGitignore(config.use_gitignore !== false);
      }
      
      if (config && config.include_tree_view !== undefined && includeTreeView !== (config.include_tree_view === true)) {
        setIncludeTreeView(config.include_tree_view === true);
      }
      
      if (config && config.show_token_count !== undefined && showTokenCount !== (config.show_token_count === true)) {
        setShowTokenCount(config.show_token_count === true);
      }
      

    } catch (error) {
      console.error('Error parsing config:', error);
    }
  }, [configContent, useCustomExcludes, useCustomIncludes, useGitignore, includeTreeView, showTokenCount]);

  // Auto-save function whenever options change or manual save
  const saveConfig = useCallback(() => {
    try {
      let config;
      
      try {
        // Parse the current config
        config = yaml.parse(configContent);
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
      config.include_tree_view = includeTreeView;
      config.show_token_count = showTokenCount;


      // Make sure include_extensions and exclude_patterns arrays are initialized if not present
      if (!config.include_extensions || !Array.isArray(config.include_extensions)) {
        config.include_extensions = [];
      }
      
      if (!config.exclude_patterns || !Array.isArray(config.exclude_patterns)) {
        config.exclude_patterns = [];
      }

      // Convert back to YAML and save
      const updatedConfig = yaml.stringify(config);
      onConfigChange(updatedConfig);

      // Save to localStorage to ensure persistence
      localStorage.setItem('configContent', updatedConfig);
      
      // Show saved indicator
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
      }, 1500);
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Error updating configuration. Please check the YAML syntax.');
    }
  }, [configContent, useCustomExcludes, useCustomIncludes, useGitignore, includeTreeView, showTokenCount, onConfigChange]);

  // Auto-save whenever any option changes, but with a small delay to prevent
  // circular updates and rapid toggling
  useEffect(() => {
    const timer = setTimeout(saveConfig, 50);
    return () => clearTimeout(timer);
  }, [useCustomExcludes, useCustomIncludes, useGitignore, includeTreeView, showTokenCount, saveConfig]);

  // State to track the current folder path
  const [folderPath, setFolderPath] = useState(localStorage.getItem('rootPath') || '');

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
    const handleRootPathChanged = (e) => {
      if (e.detail && e.detail !== folderPath) {
        setFolderPath(e.detail);
      }
    };
    
    window.addEventListener('rootPathChanged', handleRootPathChanged);
    
    return () => {
      clearInterval(pathCheckInterval);
      window.removeEventListener('rootPathChanged', handleRootPathChanged);
    };
  }, [folderPath]);

  // Handle folder selection
  const handleFolderSelect = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const dirPath = await window.electronAPI.selectDirectory();
      if (dirPath) {
        // Store the selected path in localStorage for use across the app
        localStorage.setItem('rootPath', dirPath);
        setFolderPath(dirPath);
        
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('rootPathChanged', { detail: dirPath }));
        
        // Automatically switch to Select Files tab
        setTimeout(() => {
          goToSourceTab();
        }, 500);
      }
    }
  };

  const goToSourceTab = () => {
    // Switch to the Source tab
    if (window.switchToTab) {
      window.switchToTab('source');
    }
  };

  return (
    <div>

      {/* Folder selector */}
      <div className='mb-4'>
        <div className='flex'>
          <input
            type='text'
            className='grow border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 cursor-pointer'
            value={folderPath}
            readOnly
            placeholder='Select a root folder'
            onClick={handleFolderSelect}
            title="Click to browse for a directory"
          />
          <button
            onClick={handleFolderSelect}
            className='ml-2 inline-flex items-center border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          >
            <svg 
              className="w-4 h-4 mr-1" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" 
              />
            </svg>
            Select Folder
          </button>
        </div>
      </div>
      
      <div className='mb-4'>
        <div className='rounded-md border border-gray-200 bg-gray-50 p-4'>

          
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-2'>
            {/* File Filtering section */}
            <div className='rounded border border-gray-200 bg-white p-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700'>File Filtering</h4>
              
              <div className='space-y-2'>
                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-custom-includes'
                    checked={useCustomIncludes}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setUseCustomIncludes(newValue);
                      
                      // Directly update the config to ensure it persists
                      try {
                        const config = yaml.parse(configContent) || {};
                        config.use_custom_includes = newValue;
                        const updatedConfig = yaml.stringify(config);
                        onConfigChange(updatedConfig);
                        localStorage.setItem('configContent', updatedConfig);
                      } catch (error) {
                        console.error('Error updating config:', error);
                      }
                    }}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label htmlFor='use-custom-includes' className='ml-2 block text-sm text-gray-700'>
                    Filter by file extensions
                  </label>
                </div>
                
                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-custom-excludes'
                    checked={useCustomExcludes}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setUseCustomExcludes(newValue);
                      
                      // Directly update the config to ensure it persists
                      try {
                        const config = yaml.parse(configContent) || {};
                        config.use_custom_excludes = newValue;
                        const updatedConfig = yaml.stringify(config);
                        onConfigChange(updatedConfig);
                        localStorage.setItem('configContent', updatedConfig);
                      } catch (error) {
                        console.error('Error updating config:', error);
                      }
                    }}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label htmlFor='use-custom-excludes' className='ml-2 block text-sm text-gray-700'>
                    Use exclude patterns
                  </label>
                </div>
                
                <div className='flex items-center'>
                  <input
                    type='checkbox'
                    id='use-gitignore'
                    checked={useGitignore}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setUseGitignore(newValue);
                      
                      // Directly update the config to ensure it persists
                      try {
                        const config = yaml.parse(configContent) || {};
                        config.use_gitignore = newValue;
                        const updatedConfig = yaml.stringify(config);
                        onConfigChange(updatedConfig);
                        localStorage.setItem('configContent', updatedConfig);
                      } catch (error) {
                        console.error('Error updating config:', error);
                      }
                    }}
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                  />
                  <label htmlFor='use-gitignore' className='ml-2 block text-sm text-gray-700'>
                    Apply .gitignore rules
                  </label>
                </div>
              </div>
            </div>
            
            {/* Output Formatting section */}
            <div className='rounded border border-gray-200 bg-white p-4'>
              <h4 className='mb-2 text-sm font-semibold text-gray-700'>Output Formatting</h4>
              
              <div className='space-y-2'>
                <div className='flex items-center'>
                  <input
                    id='include-tree-view'
                    type='checkbox'
                    className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                    checked={includeTreeView}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setIncludeTreeView(newValue);
                      
                      // Directly update the config to ensure it persists
                      try {
                        const config = yaml.parse(configContent) || {};
                        config.include_tree_view = newValue;
                        const updatedConfig = yaml.stringify(config);
                        onConfigChange(updatedConfig);
                        localStorage.setItem('configContent', updatedConfig);
                      } catch (error) {
                        console.error('Error updating config:', error);
                      }
                    }}
                  />
                  <label
                    htmlFor='include-tree-view'
                    className='ml-2 block text-sm text-gray-700'
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
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setShowTokenCount(newValue);
                      
                      // Directly update the config to ensure it persists
                      try {
                        const config = yaml.parse(configContent) || {};
                        config.show_token_count = newValue;
                        const updatedConfig = yaml.stringify(config);
                        onConfigChange(updatedConfig);
                        localStorage.setItem('configContent', updatedConfig);
                      } catch (error) {
                        console.error('Error updating config:', error);
                      }
                    }}
                  />
                  <label
                    htmlFor='show-token-count'
                    className='ml-2 block text-sm text-gray-700'
                  >
                    Display token counts
                  </label>
                </div>
              </div>
            </div>
          </div>

          <p className='mt-3 text-xs text-gray-500'>
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
            <h4 className='mb-2 text-xs font-medium text-gray-700'>Only process files with these extensions</h4>
            <p className='text-xs text-gray-500 mb-1'>One extension per line (include the dot)</p>
            <textarea
              className='h-44 w-full border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={fileExtensions}
              placeholder='.py
.js
.jsx
.ts
.tsx'
              onChange={(e) => {
                const newText = e.target.value;
                setFileExtensions(newText);
                
                // Convert to array and update config
                try {
                  const extensions = plainTextToYamlArray(newText);
                  const config = yaml.parse(configContent) || {};
                  config.include_extensions = extensions;
                  const updatedConfig = yaml.stringify(config);
                  onConfigChange(updatedConfig);
                  localStorage.setItem('configContent', updatedConfig);
                } catch (error) {
                  console.error('Error updating extensions:', error);
                }
              }}
            />
          </div>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700'>Exclude Patterns</h4>
            <p className='text-xs text-gray-500 mb-1'>One pattern per line (using glob pattern)</p>
            <textarea
              className='h-44 w-full border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={excludePatterns}
              placeholder='**/.git/**
**/node_modules/**
**/dist/**
**/build/**'
              onChange={(e) => {
                const newText = e.target.value;
                setExcludePatterns(newText);
                
                // Convert to array and update config
                try {
                  const patterns = plainTextToYamlArray(newText);
                  const config = yaml.parse(configContent) || {};
                  config.exclude_patterns = patterns;
                  const updatedConfig = yaml.stringify(config);
                  onConfigChange(updatedConfig);
                  localStorage.setItem('configContent', updatedConfig);
                } catch (error) {
                  console.error('Error updating patterns:', error);
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className='mt-4 text-xs text-gray-500'>
        <p>Configure which file types to include and patterns to exclude in the analysis.</p>
      </div>
    </div>
  );
};

ConfigTab.propTypes = {
  configContent: PropTypes.string.isRequired,
  onConfigChange: PropTypes.func.isRequired,
};

export default ConfigTab;
