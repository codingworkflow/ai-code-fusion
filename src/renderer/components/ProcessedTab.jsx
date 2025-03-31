import React, { useState } from 'react';
import PropTypes from 'prop-types';

const ProcessedTab = ({ processedResult, onSave, onRefresh }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onSave();
    setTimeout(() => {
      setIsSaving(false);
    }, 1000);
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    }
  };

  const handleCopy = () => {
    if (processedResult) {
      navigator.clipboard.writeText(processedResult.content);
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }
  };

  return (
    <div>
      {processedResult ? (
        <>
          {/* Action buttons with processing stats in the center */}
          <div className='mb-4 flex justify-between items-center'>
            <div>
              <button
                onClick={handleRefresh}
                className='inline-flex items-center border border-transparent bg-green-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
                disabled={isRefreshing}
                title='Reload selected files and regenerate output with latest content'
              >
                {isRefreshing ? (
                  <>
                    <svg
                      className='animate-spin -ml-1 mr-2 h-4 w-4'
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
                    Reprocessing...
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
                        d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                      />
                    </svg>
                    Refresh Code
                  </>
                )}
              </button>
            </div>

            {/* Stats in the center */}
            <div className='flex items-center'>
              <div className='flex items-center'>
                <span className='text-sm text-gray-500 dark:text-gray-400 mr-2'>Files</span>
                <span className='text-lg font-bold text-blue-600'>
                  {processedResult.processedFiles}
                </span>
              </div>

              <div className='text-gray-400 mx-3'>|</div>

              <div className='flex items-center'>
                <span className='text-sm text-gray-500 dark:text-gray-400 mr-2'>Tokens</span>
                <span className='text-lg font-bold text-green-600'>
                  {processedResult.totalTokens.toLocaleString()}
                </span>
              </div>

              {processedResult.skippedFiles > 0 && (
                <>
                  <div className='text-gray-400 mx-3'>|</div>
                  <div className='flex items-center'>
                    <span className='text-sm text-gray-500 dark:text-gray-400 mr-2'>Skipped</span>
                    <span className='text-lg font-bold text-amber-600'>
                      {processedResult.skippedFiles}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className='flex space-x-2'>
              <button
                onClick={handleCopy}
                className='inline-flex items-center border border-gray-300 bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none'
              >
                {isCopied ? (
                  '✓ Copied'
                ) : (
                  <>
                    <svg
                      className='w-4 h-4 mr-2'
                      fill='currentColor'
                      viewBox='0 0 16 16'
                      xmlns='http://www.w3.org/2000/svg'
                    >
                      <path d='M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z' />
                      <path d='M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z' />
                    </svg>
                    Copy Content
                  </>
                )}
              </button>
              <button
                onClick={handleSave}
                className={`inline-flex items-center border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm ${
                  isSaving ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none`}
              >
                {isSaving ? (
                  '✓ Saving...'
                ) : (
                  <>
                    <svg
                      className='w-4 h-4 mr-2'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                      xmlns='http://www.w3.org/2000/svg'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4'
                      />
                    </svg>
                    Save to File
                  </>
                )}
              </button>
            </div>
          </div>

          <div className='mb-4'>
            <div className='mb-1 flex items-center justify-between'>
              <label
                htmlFor='processed-content'
                className='block text-sm font-medium text-gray-700 dark:text-gray-300'
              >
                Processed Content
              </label>
              <div className='text-xs text-gray-500 dark:text-gray-400'>Content is ready to be saved</div>
            </div>
            <div
              id='processed-content'
              className='max-h-96 overflow-auto rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 p-4 shadow-sm'
            >
              <pre className='whitespace-pre-wrap font-mono text-xs leading-5 dark:text-white'>
                {processedResult.content}
              </pre>
            </div>
          </div>

          {/* Files by Token Count section added to ProcessedTab */}
          <div className='mt-6'>
            <h3 className='mb-2 text-base font-medium text-gray-900 dark:text-gray-100'>Files by Token Count</h3>
            <div className='rounded-md border border-gray-200 dark:border-gray-700 shadow-sm'>
              <div className='h-60 max-h-60 overflow-y-auto overflow-x-hidden'>
                <table className='min-w-full divide-y divide-gray-200'>
                  <thead className='sticky top-0 bg-gray-50 dark:bg-gray-800'>
                    <tr>
                      <th className='px-3 py-1 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
                        File Path
                      </th>
                      <th className='px-3 py-1 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'>
                        Tokens
                      </th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-700'>
                    {processedResult.filesInfo && processedResult.filesInfo.length > 0 ? (
                      processedResult.filesInfo.map((file, index) => (
                        <tr key={`${file.path}-${index}`} className='hover:bg-gray-50 dark:hover:bg-gray-600'>
                          <td className='max-w-md truncate px-3 py-1 font-mono text-xs dark:text-gray-200'>
                            {file.path}
                          </td>
                          <td className='px-3 py-1 text-right text-xs dark:text-gray-200'>
                            {file.tokens.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan='2' className='px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400'>
                          No file data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className='flex h-64 flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'>
          <svg
            className='mb-4 size-12 text-gray-400 dark:text-gray-500'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'
            xmlns='http://www.w3.org/2000/svg'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth='2'
              d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
            ></path>
          </svg>
          <p className='mb-2 font-medium text-gray-500 dark:text-gray-400'>No processed content yet</p>
          <p className='px-6 text-center text-sm text-gray-400 dark:text-gray-500'>
            Go to the Source tab to select files, then analyze and process them.
          </p>
        </div>
      )}
    </div>
  );
};

ProcessedTab.propTypes = {
  processedResult: PropTypes.object,
  onSave: PropTypes.func.isRequired,
  onRefresh: PropTypes.func,
};

export default ProcessedTab;
