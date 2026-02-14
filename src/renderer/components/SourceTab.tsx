import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import yaml from 'yaml';

import FileTree from './FileTree';
import Spinner from './icons/Spinner';

import type { CountFilesTokensResult, DirectoryTreeItem, SelectionHandler } from '../../types/ipc';

type SourceTabProps = {
  rootPath: string;
  directoryTree: DirectoryTreeItem[];
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  configContent: string;
  onDirectorySelect: () => Promise<void> | void;
  onFileSelect: SelectionHandler;
  onFolderSelect: SelectionHandler;
  onBatchSelect: (files: string[], folders: string[], isSelected: boolean) => void;
  onAnalyze: () => Promise<unknown>;
  onRefreshTree: () => Promise<void>;
};

type TokenCacheEntry = {
  tokenCount: number;
  mtime: number;
  size: number;
};

type TokenCache = Record<string, TokenCacheEntry>;

const updateTokenCache = (
  results: CountFilesTokensResult['results'],
  stats: CountFilesTokensResult['stats'],
  setTokenCache: React.Dispatch<React.SetStateAction<TokenCache>>
) => {
  setTokenCache((prevCache) => {
    const newCache = { ...prevCache };

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

const getProcessButtonClass = (rootPath: string, hasSelection: boolean, isBusy: boolean) => {
  const isDisabled = !rootPath || !hasSelection || isBusy;

  const baseClass =
    'inline-flex items-center border border-transparent px-5 py-2 text-sm font-medium text-white shadow-sm';
  const enabledClass =
    'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
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
  configContent,
  onBatchSelect,
  onAnalyze,
  onRefreshTree,
}: SourceTabProps) => {
  const { t } = useTranslation();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showTokenCount, setShowTokenCount] = useState(true);
  const [totalTokens, setTotalTokens] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [tokenCache, setTokenCache] = useState<TokenCache>({});
  const pendingCalculationRef = useRef<number | null>(null);
  const appWindow = globalThis as Window & typeof globalThis;

  const selectedFilesArray = [...selectedFiles];

  const handleDirectorySelect = async () => {
    setTokenCache({});
    setTotalTokens(0);
    if (pendingCalculationRef.current !== null) {
      appWindow.clearTimeout(pendingCalculationRef.current);
      pendingCalculationRef.current = null;
    }
    await onDirectorySelect();
  };

  useEffect(() => {
    try {
      if (configContent) {
        const config = yaml.parse(configContent) as { show_token_count?: boolean };
        setShowTokenCount(config.show_token_count !== false);
      }
    } catch (error) {
      console.error('Error parsing config for token count visibility:', error);
    }
  }, [configContent]);

  useEffect(() => {
    if (pendingCalculationRef.current !== null) {
      appWindow.clearTimeout(pendingCalculationRef.current);
      pendingCalculationRef.current = null;
    }

    if (selectedFiles.size === 0) {
      setTotalTokens(0);
      setIsCalculating(false);
      return undefined;
    }

    const electronAPI = appWindow.electronAPI;
    if (!electronAPI?.countFilesTokens) {
      setIsCalculating(false);
      return undefined;
    }

    setIsCalculating(true);

    const cachedTotal = selectedFilesArray.reduce((sum, filePath) => {
      return sum + (tokenCache[filePath]?.tokenCount || 0);
    }, 0);

    setTotalTokens(cachedTotal);

    const filesToProcess = selectedFilesArray.filter((filePath) => !tokenCache[filePath]);

    if (filesToProcess.length === 0) {
      setIsCalculating(false);
      return undefined;
    }

    pendingCalculationRef.current = appWindow.setTimeout(async () => {
      try {
        const batchSize = Math.min(20, filesToProcess.length);
        const fileBatch = filesToProcess.slice(0, batchSize);

        const { results, stats } = await electronAPI.countFilesTokens({
          rootPath,
          filePaths: fileBatch,
        });

        const normalizedResults: CountFilesTokensResult['results'] = { ...results };
        for (const filePath of fileBatch) {
          if (!Object.hasOwn(normalizedResults, filePath)) {
            normalizedResults[filePath] = 0;
          }
        }

        updateTokenCache(normalizedResults, stats, setTokenCache);

        const newTotal = selectedFilesArray.reduce((sum, filePath) => {
          return sum + (normalizedResults[filePath] || tokenCache[filePath]?.tokenCount || 0);
        }, 0);

        setTotalTokens(newTotal);

        if (filesToProcess.length > batchSize) {
          pendingCalculationRef.current = appWindow.setTimeout(() => {
            appWindow.dispatchEvent(new Event('tokenCalculationContinue'));
          }, 10);
        } else {
          setIsCalculating(false);
        }
      } catch (error) {
        console.error('Error calculating tokens:', error);
        setIsCalculating(false);
      }
    }, 300);

    return () => {
      if (pendingCalculationRef.current !== null) {
        appWindow.clearTimeout(pendingCalculationRef.current);
        pendingCalculationRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedFilesArray is derived from selectedFiles
  }, [selectedFiles, tokenCache, rootPath, appWindow]);

  useEffect(() => {
    const handleContinue = () => {
      setTokenCache((prevCache) => ({ ...prevCache }));
    };

    appWindow.addEventListener('tokenCalculationContinue', handleContinue);

    return () => {
      appWindow.removeEventListener('tokenCalculationContinue', handleContinue);
    };
  }, [appWindow]);

  const hasSelection = selectedFiles.size > 0 || selectedFolders.size > 0;
  const isProcessBusy = isAnalyzing || isCalculating;
  const isProcessDisabled = !rootPath || !hasSelection || isProcessBusy;
  const renderProcessButtonContent = () => {
    if (isAnalyzing) {
      return (
        <>
          <Spinner className='-ml-1 mr-2 h-4 w-4 text-white' data-testid='process-selected-files-spinner' />
          {t('source.processingSelectedFiles')}
        </>
      );
    }

    if (isCalculating) {
      return (
        <>
          <Spinner className='-ml-1 mr-2 h-4 w-4 text-white' data-testid='process-selected-files-spinner' />
          {t('source.selectingFiles')}
        </>
      );
    }

    return (
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
        {t('source.processSelectedFiles')}
      </>
    );
  };

  let fileSelectionContent: React.ReactNode = null;
  if (directoryTree.length > 0) {
    fileSelectionContent = (
      <div className='mb-6 flex min-h-0 flex-1 flex-col'>
        <div className='mb-2 flex items-center'>
          <label
            htmlFor='file-folder-selection'
            className='block text-sm font-medium text-gray-700 dark:text-gray-300'
          >
            {t('source.selectFilesAndFolders')}
          </label>
        </div>

        <div
          id='file-folder-selection'
          className='flex min-h-0 flex-1 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm'
        >
          <FileTree
            items={directoryTree}
            selectedFiles={selectedFiles}
            selectedFolders={selectedFolders}
            onFileSelect={onFileSelect}
            onFolderSelect={onFolderSelect}
            onBatchSelect={onBatchSelect}
          />
        </div>
      </div>
    );
  } else if (rootPath) {
    fileSelectionContent = (
      <div className='mb-6 rounded-md border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800'>
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
        <p className='mt-2 text-gray-500 dark:text-gray-400'>{t('source.loadingDirectory')}</p>
      </div>
    );
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='mb-4'>
        <div className='flex'>
          <input
            type='text'
            className='grow border border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 cursor-pointer'
            value={rootPath}
            readOnly
            placeholder={t('source.selectRootFolderPlaceholder')}
            onClick={handleDirectorySelect}
            title={t('source.browseDirectoryTitle')}
          />
          <button
            onClick={handleDirectorySelect}
            className='ml-2 inline-flex items-center border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800'
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
            {t('source.changeFolder')}
          </button>
        </div>
      </div>

      <div className='mb-4 flex flex-wrap items-center gap-3'>
        {rootPath && (
          <div className='flex space-x-2'>
            <button
              onClick={async () => {
                setTokenCache({});
                setTotalTokens(0);
                if (pendingCalculationRef.current !== null) {
                  appWindow.clearTimeout(pendingCalculationRef.current);
                  pendingCalculationRef.current = null;
                }
                await onRefreshTree();
              }}
              className='inline-flex items-center border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800'
              title={t('source.refreshFileListTitle')}
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
              {t('source.refreshFileList')}
            </button>

            <button
              onClick={() => {
                onBatchSelect([...selectedFiles], [...selectedFolders], false);
                setTotalTokens(0);
                if (pendingCalculationRef.current !== null) {
                  appWindow.clearTimeout(pendingCalculationRef.current);
                  pendingCalculationRef.current = null;
                }
                setIsCalculating(false);
              }}
              className='inline-flex items-center border border-transparent bg-gray-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800'
              title={t('source.clearSelectionTitle')}
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
              {t('source.clearSelection')}
            </button>
          </div>
        )}

        <div className='ml-auto flex items-center space-x-4'>
          <div className='flex items-center'>
            <span className='text-sm text-gray-500 dark:text-gray-400 mr-2'>{t('common.files')}</span>
            <span className='text-lg font-bold text-blue-600 dark:text-blue-400'>
              {selectedFiles.size}
            </span>
          </div>

          {showTokenCount && (
            <>
              <div className='text-gray-400 mx-1'>|</div>
              <div className='flex items-center'>
                <span className='text-sm text-gray-500 dark:text-gray-400 mr-2'>{t('common.tokens')}</span>
                <span className='text-lg font-bold text-green-600 dark:text-green-400'>
                  {totalTokens.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>

        <button
          data-testid='process-selected-files-button'
          onClick={() => {
            setIsAnalyzing(true);
            Promise.resolve(onAnalyze())
              .catch((error) => {
                console.error('Error processing selected files:', error);
              })
              .finally(() => {
                setIsAnalyzing(false);
              });
          }}
          disabled={isProcessDisabled}
          className={getProcessButtonClass(rootPath, hasSelection, isProcessBusy)}
        >
          {renderProcessButtonContent()}
        </button>
      </div>

      {fileSelectionContent}

      {isAnalyzing && (
        <div className='mt-4 p-4 bg-blue-50 rounded-md border border-blue-100 dark:border-blue-800 dark:bg-blue-900/30'>
          <div className='flex items-center justify-center text-blue-700 dark:text-blue-300'>
            <Spinner className='-ml-1 mr-3 h-5 w-5' />
            {t('source.analyzingWait')}
          </div>
        </div>
      )}
    </div>
  );
};

export default SourceTab;
