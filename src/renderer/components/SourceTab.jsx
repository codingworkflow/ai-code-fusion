import React, { useState } from 'react';
import PropTypes from 'prop-types';
import yaml from 'yaml';
import FileTree from './FileTree';

const SourceTab = ({
  rootPath,
  directoryTree,
  selectedFiles,
  selectedFolders,
  onDirectorySelect,
  onFileSelect,
  onFolderSelect,
  onAnalyze,
}) => {

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleDirectorySelect = async () => {
    await onDirectorySelect();
  };


  // State to check if we should show token count
  const [showTokenCount, setShowTokenCount] = useState(true);
  // State to store the estimated token count
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  
  // Get the config on component mount to see if we should show token count
  React.useEffect(() => {
    try {
      const configContent = localStorage.getItem('configContent');
      if (configContent) {
        const config = yaml.parse(configContent);
        setShowTokenCount(config.show_token_count !== false);
      }
    } catch (error) {
      console.error('Error parsing config for token count visibility:', error);
    }
  }, []);
  
  // Calculate estimated tokens whenever selected files change
  React.useEffect(() => {
    // Simple token estimation based on number of files
    // In a real implementation, this would need to load file content and do proper counting
    // Using a higher estimate to better match the actual token count shown in the ProcessedTab
    const totalEstimate = selectedFiles.length * 800; // Higher estimate to match actual processing
    setEstimatedTokens(totalEstimate);
  }, [selectedFiles]);

  return (
    <div>
      <div className='mb-4'>
        <label className='mb-1 block text-sm font-medium text-gray-700'>Folder selector</label>
        <div className='flex'>
          <input
            type='text'
            className='grow rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500'
            value={rootPath}
            readOnly
            placeholder='Select a root folder'
          />
          <button
            onClick={handleDirectorySelect}
            className='ml-2 inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          >
            Browse
          </button>
        </div>
      </div>
      
      {/* Processing Summary and Process Button on same line */}
      <div className='mb-4 flex justify-between items-center'>
        <div className='flex space-x-4'>
          <div className='rounded bg-white p-3 shadow-sm border border-gray-200'>
            <div className='text-xs text-gray-500'>Selected Files</div>
            <div className='text-xl font-bold text-blue-600'>
              {selectedFiles.length}
            </div>
          </div>

          {showTokenCount && (
            <div className='rounded bg-white p-3 shadow-sm border border-gray-200'>
              <div className='text-xs text-gray-500'>Total Tokens (estimated)</div>
              <div className='text-xl font-bold text-green-600'>
                {estimatedTokens.toLocaleString()}
              </div>
            </div>
          )}
        </div>
        
        <button
          onClick={() => {
            setIsAnalyzing(true);
            onAnalyze().finally(() => {
              setIsAnalyzing(false);
            });
          }}
          disabled={!rootPath || selectedFiles.length === 0 || isAnalyzing}
          className={`inline-flex items-center rounded-md border border-transparent px-5 py-2 text-sm font-medium text-white shadow-sm ${
            !rootPath || selectedFiles.length === 0 || isAnalyzing
              ? 'cursor-not-allowed bg-gray-400'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          }`}
        >
          {isAnalyzing ? (
            <>
              <svg
                className='animate-spin -ml-1 mr-2 h-4 w-4 text-white'
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
              >
                <circle
                  className='opacity-25'
                  cx='12'
                  cy='12'
                  r='10'
                  stroke='currentColor'
                  strokeWidth='4'
                ></circle>
                <path
                  className='opacity-75'
                  fill='currentColor'
                  d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                ></path>
              </svg>
              Processing...
            </>
          ) : (
            <>Process Files</>
          )}
        </button>
      </div>
      
      {/* Refresh button */}
      <div className='mb-4'>
        {rootPath && (
          <button
            onClick={async () => {
              // Use the refreshDirectoryTree function exposed by App.jsx
              if (window.refreshDirectoryTree) {
                await window.refreshDirectoryTree();
              }
            }}
            className='inline-flex items-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
            title='Refresh the file list with current configuration'
          >
            <svg
              className='size-5 mr-2'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              xmlns='http://www.w3.org/2000/svg'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            Refresh Files
          </button>
        )}
      </div>

      {directoryTree.length > 0 ? (
        <div className='mb-6'>
          <div className='mb-2 flex justify-between'>
            <label className='block text-sm font-medium text-gray-700'>
              Select Files and Folders
            </label>
            {selectedFiles.length > 0 && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  selectedFiles.forEach((file) => onFileSelect(file, false));
                }}
                className='text-xs text-blue-600 hover:text-blue-800 hover:underline'
              >
                (clear)
              </button>
            )}
          </div>

          <div className='rounded-md border border-gray-200 shadow-sm'>
            <FileTree
              items={directoryTree}
              selectedFiles={selectedFiles}
              selectedFolders={selectedFolders}
              onFileSelect={onFileSelect}
              onFolderSelect={onFolderSelect}
            />
          </div>
        </div>
      ) : rootPath ? (
        <div className='mb-6 rounded-md border border-gray-200 bg-gray-50 p-8 text-center'>
          <svg
            className='mx-auto size-12 text-gray-400'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              d='M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z'
            ></path>
          </svg>
          <p className='mt-2 text-gray-500'>Loading directory content...</p>
        </div>
      ) : null}

      {isAnalyzing && (
        <div className='mt-4 p-4 bg-blue-50 rounded-md border border-blue-100'>
          <div className='flex items-center justify-center text-blue-700'>
            <svg
              className='animate-spin -ml-1 mr-3 h-5 w-5'
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 24 24'
            >
              <circle
                className='opacity-25'
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='4'
              ></circle>
              <path
                className='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
              ></path>
            </svg>
            Analyzing selected files, please wait...
          </div>
        </div>
      )}
    </div>
  );
};

SourceTab.propTypes = {
  rootPath: PropTypes.string.isRequired,
  directoryTree: PropTypes.array.isRequired,
  selectedFiles: PropTypes.array.isRequired,
  selectedFolders: PropTypes.array,
  onDirectorySelect: PropTypes.func.isRequired,
  onFileSelect: PropTypes.func.isRequired,
  onFolderSelect: PropTypes.func.isRequired,
  onAnalyze: PropTypes.func.isRequired,
};

export default SourceTab;