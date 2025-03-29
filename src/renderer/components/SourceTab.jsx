import React, { useState } from 'react';
import PropTypes from 'prop-types';
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
  onRefreshDirectory,
}) => {
  const [supportingText, setSupportingText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleDirectorySelect = async () => {
    await onDirectorySelect();
    // Update message to make it clear selections are reset
    setSupportingText(
      'New directory selected. All previous selections have been cleared. Please select files or folders to analyze.'
    );
  };

  // No tree view generation needed in SourceTab anymore

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
          {rootPath && (
            <button
              onClick={async () => {
                // Use dedicated refresh function instead of directory select
                const refreshed = await onRefreshDirectory();
                if (refreshed) {
                  // Update supporting text to indicate refresh
                  setSupportingText('Directory refreshed. Select files or folders to analyze.');
                }
              }}
              className='ml-2 inline-flex items-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              title='Refresh the directory tree with current exclude patterns'
            >
              <svg
                className='size-5'
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
            </button>
          )}
        </div>
      </div>

      {supportingText && (
        <div className='mb-4 rounded-md border border-blue-100 bg-blue-50 p-3'>
          <div className='flex'>
            <div className='shrink-0'>
              <svg
                className='size-5 text-blue-400'
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 20 20'
                fill='currentColor'
                aria-hidden='true'
              >
                <path
                  fillRule='evenodd'
                  d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
                  clipRule='evenodd'
                />
              </svg>
            </div>
            <div className='ml-3'>
              <p className='text-sm text-blue-700'>{supportingText}</p>
              {directoryTree.length > 0 && (
                <p className='mt-1 text-xs text-blue-600'>
                  <span className='font-medium'>Tip:</span> Click on folder names to
                  expand/collapse. Use checkboxes to select files and folders.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {directoryTree.length > 0 ? (
        <div className='mb-6'>
          <div className='mb-2 flex items-center justify-between'>
            <label className='block text-sm font-medium text-gray-700'>
              Select Files and Folders
            </label>
            <div className='text-sm font-medium text-blue-600'>
              {selectedFiles.length > 0 ? (
                <span>
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </span>
              ) : (
                <span>No files selected</span>
              )}
            </div>
          </div>

          {/* Notice about excluded directories */}
          <div className='mb-3 rounded-md border border-green-100 bg-green-50 p-2 text-sm text-green-800'>
            <div className='flex'>
              <div className='shrink-0'>
                <svg
                  className='size-5 text-green-500'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                  xmlns='http://www.w3.org/2000/svg'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M5 13l4 4L19 7'
                  />
                </svg>
              </div>
              <p className='ml-2'>
                <span className='font-medium'>Note:</span> Large directories like{' '}
                <code className='rounded bg-green-100 px-1 text-xs font-mono'>node_modules</code>,{' '}
                <code className='rounded bg-green-100 px-1 text-xs font-mono'>.git</code>, etc. are
                excluded based on your configuration, improving performance.
              </p>
            </div>
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

      <div className='mt-6 flex items-center justify-between'>
        <div className='text-sm text-gray-500'>
          {selectedFiles.length > 0 ? (
            <span>
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              {/* Add a button to clear selections if needed */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  // Call the parent's onFileSelect for each file to deselect it
                  selectedFiles.forEach((file) => onFileSelect(file, false));
                }}
                className='ml-2 text-xs text-blue-600 hover:text-blue-800 hover:underline'
              >
                (clear)
              </button>
            </span>
          ) : (
            <span>No files selected</span>
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
              Analyzing...
            </>
          ) : (
            <>Analyze Files</>
          )}
        </button>
      </div>

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
  onRefreshDirectory: PropTypes.func.isRequired,
};

export default SourceTab;
