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
          <div className='mb-4'>
            <h3 className='mb-2 text-lg font-medium text-gray-900'>Processing Summary</h3>
            <div className='rounded-md bg-gray-100 p-4 shadow-sm'>
              <div className='grid grid-cols-3 gap-4'>
                <div className='rounded bg-white p-3 shadow-sm'>
                  <div className='text-xs text-gray-500'>Processed Files</div>
                  <div className='text-xl font-bold text-blue-600'>
                    {processedResult.processedFiles}
                  </div>
                </div>

                <div className='rounded bg-white p-3 shadow-sm'>
                  <div className='text-xs text-gray-500'>Total Tokens</div>
                  <div className='text-xl font-bold text-green-600'>
                    {processedResult.totalTokens.toLocaleString()}
                  </div>
                </div>

                {processedResult.skippedFiles > 0 && (
                  <div className='rounded bg-white p-3 shadow-sm'>
                    <div className='text-xs text-gray-500'>Skipped Files</div>
                    <div className='text-xl font-bold text-amber-600'>
                      {processedResult.skippedFiles}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Action buttons moved above the processed content */}
          <div className='mb-4 flex justify-between'>
            <div>
              <button
                onClick={handleRefresh}
                className='inline-flex items-center rounded-md border border-gray-300 bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none'
                disabled={isRefreshing}
              >
                {isRefreshing ? '⟳ Reloading...' : '⟳ Reload and Reprocess'}
              </button>
            </div>
            <div className='flex space-x-2'>
              <button
                onClick={handleCopy}
                className='inline-flex items-center rounded-md border border-gray-300 bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none'
              >
                {isCopied ? '✓ Copied' : 'Copy Content'}
              </button>
              <button
                onClick={handleSave}
                className={`inline-flex items-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm ${
                  isSaving ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                } focus:outline-none`}
              >
                {isSaving ? '✓ Saving...' : 'Save to File'}
              </button>
            </div>
          </div>

          <div className='mb-4'>
            <div className='mb-1 flex items-center justify-between'>
              <label className='block text-sm font-medium text-gray-700'>Processed Content</label>
              <div className='text-xs text-gray-500'>Content is ready to be saved</div>
            </div>
            <div className='max-h-96 overflow-auto rounded-md border border-gray-300 bg-white p-4 shadow-sm'>
              <pre className='whitespace-pre-wrap font-mono text-sm'>{processedResult.content}</pre>
            </div>
          </div>
          
          {/* Files by Token Count section added to ProcessedTab */}
          <div className='mt-6'>
            <h3 className='mb-2 text-base font-medium text-gray-900'>Files by Token Count</h3>
            <div className='rounded-md border border-gray-200 shadow-sm'>
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
                    {processedResult.filesInfo && processedResult.filesInfo.map((file, index) => (
                      <tr key={`${file.path}-${index}`} className='hover:bg-gray-50'>
                        <td className='max-w-md truncate px-3 py-2 font-mono text-sm'>{file.path}</td>
                        <td className='px-3 py-2 text-right text-sm'>{file.tokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className='flex h-64 flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-50'>
          <svg
            className='mb-4 size-12 text-gray-400'
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
          <p className='mb-2 font-medium text-gray-500'>No processed content yet</p>
          <p className='px-6 text-center text-sm text-gray-400'>
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
