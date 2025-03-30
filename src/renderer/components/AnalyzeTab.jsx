import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import yaml from 'yaml';

const AnalyzeTab = ({ analysisResult, onProcess }) => {
  // Initialize with defaults, but we'll update from localStorage in useEffect
  const [includeTreeView, setIncludeTreeView] = useState(false);
  const [showTokenCount, setShowTokenCount] = useState(false);
  
  // Initialize from config when component mounts
  useEffect(() => {
    try {
      // Try to get config from localStorage if it exists
      const configContent = localStorage.getItem('configContent');
      if (configContent) {
        const config = yaml.parse(configContent);
        // Always use the config values if available
        setIncludeTreeView(config.include_tree_view === true);
        setShowTokenCount(config.show_token_count === true);
        
        // Log for debugging
        console.log('Loading analysis options from config:', {
          includeTreeView: config.include_tree_view,
          showTokenCount: config.show_token_count
        });
      }
    } catch (error) {
      console.error('Error parsing config for defaults:', error);
    }
  }, []);
  
  // Synchronize changes back to localStorage when checkbox state changes
  useEffect(() => {
    try {
      const configContent = localStorage.getItem('configContent');
      if (configContent) {
        const config = yaml.parse(configContent);
        
        // Only update if values have actually changed
        if (config.include_tree_view !== includeTreeView || 
            config.show_token_count !== showTokenCount) {
          
          config.include_tree_view = includeTreeView;
          config.show_token_count = showTokenCount;
          
          // Save to localStorage
          const updatedConfig = yaml.stringify(config);
          localStorage.setItem('configContent', updatedConfig);
          
          // Also directly trigger any parent callbacks to ensure full sync
          if (window.electronAPI && window.electronAPI.updateConfig) {
            window.electronAPI.updateConfig(updatedConfig);
          }
        }
      }
    } catch (error) {
      console.error('Error updating localStorage with checkbox changes:', error);
    }
  }, [includeTreeView, showTokenCount]);

  // Generate a tree view of the selected files
  const generateTreeView = () => {
    if (!analysisResult || !analysisResult.filesInfo || !analysisResult.filesInfo.length) {
      return '';
    }

    // This is a simplified tree view since we don't have access to the original implementation
    // You might want to move the actual tree generation logic here from SourceTab
    let treeText = 'File structure will be included in the output\n';
    analysisResult.filesInfo.forEach((file) => {
      treeText += `├── ${file.path}\n`;
    });

    return treeText;
  };

  if (!analysisResult) {
    return (
      <div className='p-8 text-center bg-gray-50 rounded-md border border-gray-200'>
        <svg
          className='mx-auto h-12 w-12 text-gray-400'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
          xmlns='http://www.w3.org/2000/svg'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            d='M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
          ></path>
        </svg>
        <h3 className='mt-2 text-sm font-medium text-gray-900'>No Analysis Available</h3>
        <p className='mt-1 text-sm text-gray-500'>
          Please select files and run analysis from the Select Files tab first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className='text-xl font-bold text-gray-900 mb-4'>Analysis Results</h2>

      <div className='mb-6 rounded-md bg-gray-50 p-4'>
        <div className='grid grid-cols-2 gap-4'>
          <div className='rounded bg-white p-3 shadow-sm'>
            <div className='text-xs text-gray-500'>Total Files</div>
            <div className='text-xl font-bold text-blue-600'>{analysisResult.filesInfo.length}</div>
          </div>

          <div className='rounded bg-white p-3 shadow-sm'>
            <div className='text-xs text-gray-500'>Total Tokens</div>
            <div className='text-xl font-bold text-green-600'>
              {analysisResult.totalTokens.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <h3 className='mb-2 text-base font-medium text-gray-900'>Files by Token Count</h3>

      <div className='mb-6 rounded-md border border-gray-200 shadow-sm'>
        <div className='max-h-60 overflow-y-auto'>
          <table className='min-w-full divide-y divide-gray-200'>
            <thead className='sticky top-0 bg-gray-50'>
              <tr>
                <th className='px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500'>
                  File Path
                </th>
                <th className='px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500'>
                  Tokens
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-200 bg-white'>
              {analysisResult.filesInfo.map((file, index) => (
                <tr key={`${file.path}-${index}`} className='hover:bg-gray-50'>
                  <td className='max-w-md truncate px-3 py-2 font-mono text-sm'>{file.path}</td>
                  <td className='px-3 py-2 text-right text-sm'>{file.tokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className='mt-6 rounded-md bg-blue-50 p-6'>
        <h3 className='text-lg font-medium text-blue-900 mb-4'>Processing Options</h3>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 mb-6'>
          <div className='rounded-md border border-blue-200 bg-white p-4'>
            <div className='flex items-center'>
              <input
                id='include-tree-view'
                type='checkbox'
                className='h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                checked={includeTreeView}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setIncludeTreeView(newValue);
                  
                  // Directly update config to ensure persistence
                  try {
                    const configContent = localStorage.getItem('configContent');
                    if (configContent) {
                      const config = yaml.parse(configContent);
                      config.include_tree_view = newValue;
                      localStorage.setItem('configContent', yaml.stringify(config));
                    }
                  } catch (error) {
                    console.error('Error updating tree view option:', error);
                  }
                }}
              />
              <label
                htmlFor='include-tree-view'
                className='ml-2 block cursor-pointer text-sm font-medium text-gray-700'
              >
                Add file tree to output
              </label>
            </div>

            <div className='mt-2 text-xs text-gray-500'>
              {includeTreeView
                ? 'A tree structure of all files will be included'
                : 'No file tree will be included'}
            </div>

            {includeTreeView && (
              <div className='mt-2 p-2 bg-gray-50 rounded border border-gray-200'>
                <div className='text-xs text-gray-500 mb-1'>Preview:</div>
                <pre className='text-xs font-mono whitespace-pre-wrap text-gray-700'>
                  {generateTreeView().substring(0, 200) +
                    (generateTreeView().length > 200 ? '...' : '')}
                </pre>
              </div>
            )}
          </div>

          <div className='rounded-md border border-blue-200 bg-white p-4'>
            <div className='flex items-center'>
              <input
                id='show-token-count'
                type='checkbox'
                className='h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500'
                checked={showTokenCount}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setShowTokenCount(newValue);
                  
                  // Directly update config to ensure persistence
                  try {
                    const configContent = localStorage.getItem('configContent');
                    if (configContent) {
                      const config = yaml.parse(configContent);
                      config.show_token_count = newValue;
                      localStorage.setItem('configContent', yaml.stringify(config));
                    }
                  } catch (error) {
                    console.error('Error updating token count option:', error);
                  }
                }}
              />
              <label
                htmlFor='show-token-count'
                className='ml-2 block cursor-pointer text-sm font-medium text-gray-700'
              >
                Show token count per file in output
              </label>
            </div>

            <div className='mt-2 text-xs text-gray-500'>
              {showTokenCount
                ? 'Token counts will be shown in file headers'
                : 'Token counts will be hidden from file headers'}
            </div>

            <div className='mt-2 p-2 bg-gray-50 rounded border border-gray-200'>
              <div className='text-xs text-gray-500 mb-1'>File header preview:</div>
              <pre className='text-xs font-mono whitespace-pre-wrap text-gray-700'>
                {'######\n'}
                {showTokenCount ? 'src\\main\\index.js (1599 tokens)' : 'src\\main\\index.js'}
                {'\n######'}
              </pre>
            </div>
          </div>
        </div>

        <div className='flex justify-center'>
          <button
            onClick={() =>
              onProcess(includeTreeView ? generateTreeView() : null, { showTokenCount })
            }
            className='inline-flex items-center rounded-md border border-transparent bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          >
            Continue to Process
          </button>
        </div>
      </div>
    </div>
  );
};

AnalyzeTab.propTypes = {
  analysisResult: PropTypes.object,
  onProcess: PropTypes.func.isRequired,
};

export default AnalyzeTab;
