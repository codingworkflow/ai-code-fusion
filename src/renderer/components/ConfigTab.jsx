import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import yaml from 'yaml';

const ConfigTab = ({ configContent, onConfigChange }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [useCustomExcludes, setUseCustomExcludes] = useState(true);
  const [useGitignore, setUseGitignore] = useState(false);
  const [filterByExtension, setFilterByExtension] = useState(true);

  // Parse config when component mounts or configContent changes
  useEffect(() => {
    try {
      const config = yaml.parse(configContent);
      // Default to true for useCustomExcludes if not specified
      setUseCustomExcludes(config.use_custom_excludes !== false);
      // Default to false for useGitignore if not specified
      setUseGitignore(config.use_gitignore === true);
      // Default to true for filterByExtension if not specified
      setFilterByExtension(config.filter_by_extension !== false);
    } catch (error) {
      console.error('Error parsing config:', error);
    }
  }, [configContent]);

  const handleSave = () => {
    try {
      // Parse the current config
      const config = yaml.parse(configContent);

      // Update the config with filter options
      config.use_custom_excludes = useCustomExcludes;
      config.use_gitignore = useGitignore;
      config.filter_by_extension = filterByExtension;

      // Convert back to YAML and save
      const updatedConfig = yaml.stringify(config);
      onConfigChange(updatedConfig);

      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
      }, 2000);
    } catch (error) {
      console.error('Error updating config:', error);
      alert('Error updating configuration. Please check the YAML syntax.');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(configContent);
    setIsCopied(true);

    // Reset copied status after 2 seconds
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  return (
    <div>
      <div className='mb-4'>
        <div className='mb-1 flex items-center justify-between'>
          <label className='block text-sm font-medium text-gray-700'>Configuration</label>
          <div className='text-xs text-gray-500'>
            Edit the configuration to filter which files should be included
          </div>
        </div>
        <textarea
          className='h-64 w-full rounded-md border border-gray-300 p-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
          value={configContent}
          onChange={(e) => {
            onConfigChange(e.target.value);
            setIsSaved(false);
          }}
        />
      </div>

      <div className='mb-4'>
        <div className='rounded-md border border-gray-200 bg-gray-50 p-4'>
          <h3 className='mb-2 text-sm font-medium text-gray-700'>Filter Options</h3>

          <div className='mb-2 flex items-center'>
            <input
              type='checkbox'
              id='use-custom-excludes'
              checked={useCustomExcludes}
              onChange={(e) => setUseCustomExcludes(e.target.checked)}
              className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
            />
            <label htmlFor='use-custom-excludes' className='ml-2 block text-sm text-gray-700'>
              Use custom exclude/include configuration
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
            <label htmlFor='use-gitignore' className='ml-2 block text-sm text-gray-700'>
              Use .gitignore rules if found
            </label>
          </div>
          
          <div className='mt-2 flex items-center'>
            <input
              type='checkbox'
              id='filter-by-extension'
              checked={filterByExtension}
              onChange={(e) => setFilterByExtension(e.target.checked)}
              className='size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500'
            />
            <label htmlFor='filter-by-extension' className='ml-2 block text-sm text-gray-700'>
              Filter files by extension type (using include_extensions list)
            </label>
          </div>

          <p className='mt-2 text-xs text-gray-500'>
            Select which filtering methods to apply when building the file tree. Changes will apply
            after saving and switching to the Source tab.
          </p>
        </div>
      </div>

      <div className='mb-6 flex justify-end space-x-2'>
        <button
          onClick={handleCopy}
          className='inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
        >
          {isCopied ? '✓ Copied' : 'Copy'}
        </button>
        <button
          onClick={handleSave}
          className='inline-flex items-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
        >
          {isSaved ? '✓ Saved' : 'Save Config'}
        </button>
      </div>

      <div className='mt-4 text-sm text-gray-600'>
        <p>Configure which file types to include and patterns to exclude in the analysis.</p>
        <p className='mt-2'>
          After saving your configuration, go to the Source tab to select files and run the
          analysis.
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
