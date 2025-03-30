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

  // Handle folder selection
  const handleFolderSelect = async () => {
    if (window.electronAPI && window.electronAPI.selectDirectory) {
      const dirPath = await window.electronAPI.selectDirectory();
      if (dirPath) {
        // Store the selected path in localStorage for use in the Source tab
        localStorage.setItem('rootPath', dirPath);
        setFolderPath(dirPath);
        
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
            className='grow rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
            value={folderPath}
            readOnly
            placeholder='Select a root folder'
          />
          <button
            onClick={handleFolderSelect}
            className='ml-2 inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          >
            Browse
          </button>
          {folderPath && (
            <button
              onClick={goToSourceTab}
              className='ml-2 inline-flex items-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
            >
              Select Files
            </button>
          )}
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
            className='inline-flex items-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none'
          >
            {isSaved ? '✓ Saved' : 'Save Config'}
          </button>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700'>Only process files with these extensions</h4>
            <p className='text-xs text-gray-500 mb-1'>One extension per line (include the dot)</p>
            <textarea
              className='h-44 w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
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
              className='h-44 w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
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
