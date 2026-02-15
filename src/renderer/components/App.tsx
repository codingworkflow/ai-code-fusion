import React from 'react';
import { useTranslation } from 'react-i18next';

import { AppProvider, useApp } from '../context/AppContext';
import { DarkModeProvider } from '../context/DarkModeContext';
import '../i18n';

import ConfigTab from './ConfigTab';
import DarkModeToggle from './DarkModeToggle';
import LanguageSelector from './LanguageSelector';
import ProcessedTab from './ProcessedTab';
import SourceTab from './SourceTab';
import TabBar from './TabBar';

const ErrorBanner = () => {
  const { appError, dismissError } = useApp();
  const { t } = useTranslation();

  if (!appError) return null;
  const translatedMessage = appError.translationKey
    ? t(appError.translationKey, appError.translationOptions)
    : appError.message;

  return (
    <div className='flex items-center justify-between bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-800 dark:text-red-200'>
      <span>{translatedMessage}</span>
      <button
        onClick={dismissError}
        className='ml-4 shrink-0 text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-100'
        aria-label={t('app.dismissError')}
      >
        <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
        </svg>
      </button>
    </div>
  );
};

const AppContent = () => {
  const { t } = useTranslation();
  const {
    activeTab,
    rootPath,
    directoryTree,
    selectedFiles,
    selectedFolders,
    processedResult,
    configContent,
    switchTab,
    selectDirectory,
    refreshDirectoryTree,
    updateConfig,
    handleFileSelect,
    handleFolderSelect,
    handleBatchSelect,
    handleAnalyze,
    handleRefreshProcessed,
    handleSaveOutput,
  } = useApp();

  const appWindow = globalThis as Window & typeof globalThis;

  return (
    <div className='mx-auto flex h-screen w-full max-w-screen-2xl flex-col p-4'>
      <div className='flex min-h-0 w-full flex-1 flex-col border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 transition-colors duration-200'>
        <div className='w-full border-b border-gray-300 dark:border-gray-700 flex justify-between items-center bg-gray-100 dark:bg-gray-800 transition-colors duration-200'>
          <TabBar activeTab={activeTab} onTabChange={switchTab} />
          <div className='flex items-center pr-4 space-x-2'>
            <LanguageSelector />
            <DarkModeToggle />
            <button
              onClick={() => {
                appWindow.electron?.shell?.openExternal?.(
                  'https://github.com/codingworkflow/ai-code-fusion'
                );
              }}
              className='flex items-center hover:text-blue-700 dark:hover:text-blue-500 cursor-pointer bg-transparent border-0 text-gray-900 dark:text-gray-100'
              title={t('app.github')}
            >
              <div className='h-8 w-8 mr-2 flex items-center justify-center'>
                <img
                  src='../assets/icon.png'
                  alt={t('app.name')}
                  className='h-8 w-8'
                  onError={(event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                    console.error('Failed to load application icon');
                    const image = event.currentTarget;
                    image.style.display = 'none';
                    const fallbackIcon = image.nextElementSibling as HTMLElement | null;
                    if (fallbackIcon) {
                      fallbackIcon.style.display = 'block';
                    }
                  }}
                />
                <svg
                  style={{ display: 'none' }}
                  xmlns='http://www.w3.org/2000/svg'
                  className='h-7 w-7'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='#1E40AF'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={1.5}
                    d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                  />
                </svg>
              </div>
              <div className='flex items-center'>
                <h1 className='text-2xl font-bold dark:text-white'>{t('app.name')}</h1>
                <svg
                  className='ml-2 w-5 h-5 text-gray-600 dark:text-gray-400'
                  fill='currentColor'
                  viewBox='0 0 24 24'
                  xmlns='http://www.w3.org/2000/svg'
                >
                  <path d='M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z' />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <ErrorBanner />

        {/* Tab content - tabs stay mounted, hidden via CSS to preserve state */}
        <div className='flex-1 min-h-0 overflow-hidden relative'>
          <div
            role='tabpanel'
            id='tabpanel-config'
            aria-labelledby='tab-config'
            className={`absolute inset-0 overflow-y-auto bg-white dark:bg-gray-800 p-4 text-gray-900 dark:text-gray-100 transition-colors duration-200 ${activeTab === 'config' ? '' : 'hidden'}`}
          >
            <ConfigTab configContent={configContent} onConfigChange={updateConfig} />
          </div>

          <div
            role='tabpanel'
            id='tabpanel-source'
            aria-labelledby='tab-source'
            className={`absolute inset-0 overflow-y-auto bg-white dark:bg-gray-800 p-4 text-gray-900 dark:text-gray-100 transition-colors duration-200 ${activeTab === 'source' ? '' : 'hidden'}`}
          >
            <SourceTab
              isActive={activeTab === 'source'}
              rootPath={rootPath}
              directoryTree={directoryTree}
              selectedFiles={selectedFiles}
              selectedFolders={selectedFolders}
              configContent={configContent}
              onDirectorySelect={selectDirectory}
              onFileSelect={handleFileSelect}
              onFolderSelect={handleFolderSelect}
              onBatchSelect={handleBatchSelect}
              onAnalyze={handleAnalyze}
              onRefreshTree={refreshDirectoryTree}
            />
          </div>

          <div
            role='tabpanel'
            id='tabpanel-processed'
            aria-labelledby='tab-processed'
            className={`absolute inset-0 overflow-y-auto bg-white dark:bg-gray-800 p-4 text-gray-900 dark:text-gray-100 transition-colors duration-200 ${activeTab === 'processed' ? '' : 'hidden'}`}
          >
            <ProcessedTab
              processedResult={processedResult}
              onSave={handleSaveOutput}
              onRefresh={handleRefreshProcessed}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  return (
    <DarkModeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </DarkModeProvider>
  );
};

export default App;
