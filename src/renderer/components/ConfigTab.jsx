import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import yaml from 'yaml';

const ConfigTab = ({ configContent, onConfigChange }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [useCustomExcludes, setUseCustomExcludes] = useState(true);
  const [useCustomIncludes, setUseCustomIncludes] = useState(true);
  const [useGitignore, setUseGitignore] = useState(true);
  const [includeTreeView, setIncludeTreeView] = useState(false);
  const [showTokenCount, setShowTokenCount] = useState(false);
  const [fileExtensions, setFileExtensions] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');

  // Extract and set file extensions and exclude patterns sections
  useEffect(() => {
    try {
      // Parse the YAML config
      const config = yaml.parse(configContent) || {};
      
      // Construct the file extensions display
      let fileExtText = "# File extensions to include (with dot)\ninclude_extensions:";
      if (config && config.include_extensions && Array.isArray(config.include_extensions)) {
        config.include_extensions.forEach(ext => {
          fileExtText += `\n  - ${ext}`;
        });
      }
      setFileExtensions(fileExtText);
      
      // Construct the exclude patterns display
      let patternsText = "# Patterns to exclude (using fnmatch syntax)\nexclude_patterns:";
      if (config && config.exclude_patterns && Array.isArray(config.exclude_patterns)) {
        config.exclude_patterns.forEach(pattern => {
          patternsText += `\n  - ${pattern}`;
        });
      }
      setExcludePatterns(patternsText);
      
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
        <label className='mb-1 block text-sm font-medium text-gray-700'>Folder selector</label>
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
          <h3 className='mb-2 text-sm font-medium text-gray-700'>Filter Options</h3>

          <div className='mb-2 flex items-center'>
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
              Use Exclude Patterns
            </label>
          </div>

          <div className='mb-2 flex items-center'>
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
              Use .gitignore rules if found
            </label>
          </div>

          <div className='mb-2 flex items-center'>
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
              Only show file extensions in the list
            </label>
          </div>
          
          <div className='mt-3 mb-2 flex items-center'>
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
              Add file tree to output
            </label>
          </div>

          <div className='mb-2 flex items-center'>
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
              Show token count in file selection
            </label>
          </div>



          <p className='mt-2 text-xs text-gray-500'>
            Select which filtering methods to apply when building the file tree. Changes will automatically 
            save and apply after switching to the Source tab.
          </p>
        </div>
      </div>

      <div className='mb-4'>
        <div className='mb-1 flex items-center justify-between'>
          <label className='block text-sm font-medium text-gray-700'>Configuration</label>
          <button
            onClick={saveConfig}
            className='inline-flex items-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none'
          >
            {isSaved ? '✓ Saved' : 'Save Config'}
          </button>
        </div>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700'>File Extensions to Include</h4>
            <textarea
              className='h-44 w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={fileExtensions}
              onChange={(e) => {
                // Extract the extensions from the textarea
                const lines = e.target.value.split('\n');
                const extensionLines = lines.filter(line => line.trim().startsWith('-'));
                const extensions = extensionLines.map(line => line.replace('-', '').trim());
                
                // Parse and update the config
                try {
                  const config = yaml.parse(configContent) || {};
                  config.include_extensions = extensions;
                  const updatedConfig = yaml.stringify(config);
                  onConfigChange(updatedConfig);
                  localStorage.setItem('configContent', updatedConfig);
                } catch (error) {
                  console.error('Error updating extensions:', error);
                }
                
                // Update the local state
                setFileExtensions(e.target.value);
              }}
            />
          </div>
          <div>
            <h4 className='mb-2 text-xs font-medium text-gray-700'>Exclude Patterns</h4>
            <textarea
              className='h-44 w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
              value={excludePatterns}
              onChange={(e) => {
                // Extract the patterns from the textarea
                const lines = e.target.value.split('\n');
                const patternLines = lines.filter(line => line.trim().startsWith('-'));
                const patterns = patternLines.map(line => line.replace('-', '').trim());
                
                // Parse and update the config
                try {
                  const config = yaml.parse(configContent) || {};
                  config.exclude_patterns = patterns;
                  const updatedConfig = yaml.stringify(config);
                  onConfigChange(updatedConfig);
                  localStorage.setItem('configContent', updatedConfig);
                } catch (error) {
                  console.error('Error updating patterns:', error);
                }
                
                // Update the local state
                setExcludePatterns(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      <div className='mt-4 text-sm text-gray-600'>
        <p>Configure which file types to include and patterns to exclude in the analysis.</p>
        <p className='mt-2'>
          Changes to configuration are automatically saved. Go to the Source tab to select files and run the analysis.
        </p>
      </div>
    </div>
  );
};

ConfigTab.propTypes = {
  configContent: PropTypes.string.isRequired,
  onConfigChange: PropTypes.func.isRequired,
};

export default ConfigTab;
