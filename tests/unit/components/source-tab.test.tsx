import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceTab from '../../../src/renderer/components/SourceTab';

const ROOT_PATH = '/mock/directory';
const SELECTED_FILE = `${ROOT_PATH}/src/App.tsx`;

function createTokenCountPromise() {
  let resolvePromise: (value: {
    results: Record<string, number>;
    stats: Record<string, { size: number; mtime: number }>;
  }) => void = () => {
    throw new Error('Token count promise resolver was not initialized');
  };

  const promise = new Promise<{
    results: Record<string, number>;
    stats: Record<string, { size: number; mtime: number }>;
  }>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}

describe('SourceTab Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    window.electronAPI.countFilesTokens = jest.fn().mockResolvedValue({
      results: {},
      stats: {},
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('disables process button with selecting state while tokens are calculating, then re-enables it', async () => {
    const tokenCountPromise = createTokenCountPromise();
    const countFilesTokensMock = jest.fn().mockReturnValue(tokenCountPromise.promise);
    window.electronAPI.countFilesTokens = countFilesTokensMock;

    render(
      <SourceTab
        rootPath={ROOT_PATH}
        directoryTree={[
          {
            type: 'file',
            name: 'App.tsx',
            path: SELECTED_FILE,
          },
        ]}
        selectedFiles={[SELECTED_FILE]}
        selectedFolders={[]}
        onDirectorySelect={jest.fn()}
        onFileSelect={jest.fn()}
        onFolderSelect={jest.fn()}
        onAnalyze={jest.fn().mockResolvedValue({})}
      />
    );

    const processButton = screen.getByTestId('process-selected-files-button');

    await waitFor(() => {
      expect(processButton).toBeDisabled();
      expect(processButton).toHaveTextContent('Selecting files...');
      expect(screen.getByTestId('process-selected-files-spinner')).toBeInTheDocument();
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(countFilesTokensMock).toHaveBeenCalledWith({
      rootPath: ROOT_PATH,
      filePaths: [SELECTED_FILE],
    });

    await act(async () => {
      tokenCountPromise.resolve({
        results: {
          [SELECTED_FILE]: 120,
        },
        stats: {
          [SELECTED_FILE]: {
            mtime: 1700000000000,
            size: 1024,
          },
        },
      });
    });

    await waitFor(() => {
      expect(processButton).toBeEnabled();
      expect(processButton).toHaveTextContent('Process Selected Files');
    });

    expect(screen.queryByTestId('process-selected-files-spinner')).not.toBeInTheDocument();
  });
});
