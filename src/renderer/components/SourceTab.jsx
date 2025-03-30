import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import yaml from 'yaml';
import FileTree from './FileTree';

// Helper function to update token cache
const updateTokenCache = (results, stats, setTokenCache) => {
  setTokenCache((prevCache) => {
    const newCache = { ...prevCache };

    // Add new entries to cache
    Object.entries(results).forEach(([file, tokenCount]) => {
      newCache[file] = {
        tokenCount,
        mtime: stats[file]?.mtime || Date.now(),
        size: stats[file]?.size || 0,
      };
    });

    return newCache;
  });
};

// Helper function to get process button class
const getProcessButtonClass = (rootPath, selectedFiles, isAnalyzing) => {
  const isDisabled = !rootPath || selectedFiles.length === 0 || isAnalyzing;
  
  const baseClass = 'inline-flex items-center border border-transparent px-5 py-2 text-sm font-medium text-white shadow-sm';
  const enabledClass = 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
  const disabledClass = 'cursor-not-allowed bg-gray-400';
  
  return `${baseClass} ${isDisabled ? disabledClass : enabledClass}`;
};

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
    // Clear the token cache when selecting a new directory
    setTokenCache({});
    setTotalTokens(0);
    if (pendingCalculationRef.current) {
      clearTimeout(pendingCalculationRef.current);
    }
    await onDirectorySelect();
  };

  // State to check if we should show token count
  const [showTokenCount, setShowTokenCount] = useState(true);
  // State for token counting
  const [totalTokens, setTotalTokens] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);

  // Enhanced token cache with metadata
  const [tokenCache, setTokenCache] = useState({});

  // Reference to store pending calculations (for cleanup)
  const pendingCalculationRef = React.useRef(null);

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

  // Debounced token calculation with improved cache handling
  React.useEffect(() => {
    // Clean up any previous calculation
    if (pendingCalculationRef.current) {
      clearTimeout(pendingCalculationRef.current);
    }

    // If no files, just reset and return
    if (selectedFiles.length === 0) {
      setTotalTokens(0);
      setIsCalculating(false);
      return;
    }

    // Set calculating flag
    setIsCalculating(true);

    // First, calculate total from already cached files
    const cachedTotal = selectedFiles.reduce((sum, file) => {
      return sum + (tokenCache[file]?.tokenCount || 0);
    }, 0);

    // Update with the cached total immediately
    setTotalTokens(cachedTotal);

    // Identify files that need processing (not in cache)
    const filesToProcess = selectedFiles.filter((file) => !tokenCache[file]);

    // If all files are already cached, we're done
    if (filesToProcess.length === 0) {
      setIsCalculating(false);
      return;
    }

    // Debounce processing to avoid rapid recalculations
    pendingCalculationRef.current = setTimeout(async () => {
      try {
        // Process files in reasonable batches (max 20 at a time)
        const batchSize = Math.min(20, filesToProcess.length);
        const fileBatch = filesToProcess.slice(0, batchSize);

        // Get token counts for the batch
        const { results, stats } = await window.electronAPI.countFilesTokens(fileBatch);

        // Extract cache update logic to avoid nested function
        updateTokenCache(results, stats, setTokenCache);

        // Calculate new total (including cached files)
        const newTotal = selectedFiles.reduce((sum, file) => {
          return (
            sum +
            (results[file] || // Use new results if available
              tokenCache[file]?.tokenCount || // Or use cached value
              0) // Fallback to 0
          );
        }, 0);

        setTotalTokens(newTotal);

        // If we still have more files to process, schedule another calculation
        if (filesToProcess.length > batchSize) {
          // Schedule processing for the remaining files
          pendingCalculationRef.current = setTimeout(() => {
            // Force re-running the effect with the existing selection
            // This will use the updated cache and process the next batch
            const event = new Event('tokenCalculationContinue');
            window.dispatchEvent(event);
          }, 10);
        } else {
          // All done
          setIsCalculating(false);
        }
      } catch (error) {
        console.error('Error calculating tokens:', error);
        setIsCalculating(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (pendingCalculationRef.current) {
        clearTimeout(pendingCalculationRef.current);
      }
    };
  }, [selectedFiles, tokenCache]);

  // Add listener for continuation of token calculation
  React.useEffect(() => {
    const handleContinue = () => {
      // Instead of directly setting selectedFiles, we manually trigger
      // recalculation by forcing a token cache update
      setTokenCache((prevCache) => ({ ...prevCache }));
    };

    window.addEventListener('tokenCalculationContinue', handleContinue);

    return () => {
      window.removeEventListener('tokenCalculationContinue', handleContinue);
    };
  }, []);

  return (
    <div>
      <div className='mb-4'>
        <div className='flex'>
          <input
            type='text'
            className='grow border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 cursor-pointer'
            value={rootPath}
            readOnly
            placeholder='Select a root folder'
            onClick={handleDirectorySelect}
            title='Click to browse for a directory'
          />
          <button
            onClick={handleDirectorySelect}
            className='ml-2 inline-flex items-center border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
          >
            <svg
              className='w-4 h-4 mr-1'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              xmlns='http://www.w3.org/2000/svg'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'
              />
            </svg>
            Change Folder
          </button>
        </div>
      </div>

      {/* Processing Summary and Process Button on same line */}
      <div className='mb-4 flex justify-between items-center'>
        {rootPath && (
          <div className='flex space-x-2'>
            <button
              onClick={async () => {
                // Clear the token cache when refreshing the file list
                setTokenCache({});
                setTotalTokens(0);
                if (pendingCalculationRef.current) {
                  clearTimeout(pendingCalculationRef.current);
                }
                // Refresh files list only
                if (window.refreshDirectoryTree) {
                  await window.refreshDirectoryTree();
                }
              }}
              className='inline-flex items-center border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
              title='Refresh the file list'
            >
              <svg
                className='size-4 mr-1'
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
              Refresh file list
            </button>

            <button
              onClick={() => {
                // Clear selected files only
                selectedFiles.forEach((file) => onFileSelect(file, false));
                setTotalTokens(0);
                if (pendingCalculationRef.current) {
                  clearTimeout(pendingCalculationRef.current);
                  pendingCalculationRef.current = null;
                }
                setIsCalculating(false);
                // No need to clear cache here as we can reuse it later
              }}
              className='inline-flex items-center border border-transparent bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
              title='Clear all selected files'
            >
              <svg
                className='size-4 mr-1'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
              Clear selection
            </button>
          </div>
        )}

        <div className='flex items-center space-x-4'>
          <div className='flex items-center'>
            <span className='text-sm text-gray-500 mr-2'>Files</span>
            <span className='text-lg font-bold text-blue-600'>{selectedFiles.length}</span>
          </div>

          {showTokenCount && (
            <>
              <div className='text-gray-400 mx-1'>|</div>
              <div className='flex items-center'>
                <span className='text-sm text-gray-500 mr-2'>Tokens</span>
                <span className='text-lg font-bold text-green-600'>
                  {totalTokens.toLocaleString()}
                  {isCalculating && (
                    <svg
                      className='inline-block animate-spin ml-2 h-4 w-4'
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
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Extract nested ternary from button class */}
        <button
          onClick={() => {
            setIsAnalyzing(true);
            onAnalyze().finally(() => {
              setIsAnalyzing(false);
            });
          }}
          disabled={!rootPath || selectedFiles.length === 0 || isAnalyzing}
          className={getProcessButtonClass(rootPath, selectedFiles, isAnalyzing)}
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
            <>
              <svg
                className='w-4 h-4 mr-2'
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M13 10V3L4 14h7v7l9-11h-7z'
                />
              </svg>
              Process Selected Files
            </>
          )}
        </button>
      </div>

      {directoryTree.length > 0 ? (
        <div className='mb-6'>
          <div className='mb-2 flex items-center'>
            <label
              htmlFor='file-folder-selection'
              className='block text-sm font-medium text-gray-700'
            >
              Select Files and Folders
            </label>
          </div>

          <div id='file-folder-selection' className='rounded-md border border-gray-200 shadow-sm'>
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
