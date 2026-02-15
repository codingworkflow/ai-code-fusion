import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceTab from '../../../src/renderer/components/SourceTab';

const ROOT_PATH = '/mock/directory';
const SELECTED_FILE = `${ROOT_PATH}/src/App.tsx`;
const UPDATED_SELECTED_FILE = `${ROOT_PATH}/src/NewApp.tsx`;

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
  const defaultDirectoryTree = [
    {
      type: 'file' as const,
      name: 'App.tsx',
      path: SELECTED_FILE,
    },
    {
      type: 'file' as const,
      name: 'NewApp.tsx',
      path: UPDATED_SELECTED_FILE,
    },
  ];

  const createProps = (overrides: Partial<React.ComponentProps<typeof SourceTab>> = {}) => ({
    isActive: true,
    rootPath: ROOT_PATH,
    directoryTree: defaultDirectoryTree,
    selectedFiles: new Set<string>([SELECTED_FILE]),
    selectedFolders: new Set<string>(),
    configContent: 'show_token_count: true',
    onDirectorySelect: jest.fn(),
    onFileSelect: jest.fn(),
    onFolderSelect: jest.fn(),
    onBatchSelect: jest.fn(),
    onAnalyze: jest.fn().mockResolvedValue({}),
    onRefreshTree: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

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

    render(<SourceTab {...createProps({ directoryTree: defaultDirectoryTree.slice(0, 1) })} />);

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

  test('stale request should not clear calculating state while newer request is in flight', async () => {
    const staleRequest = createTokenCountPromise();
    const activeRequest = createTokenCountPromise();
    const countFilesTokensMock = jest
      .fn()
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValueOnce(activeRequest.promise);
    window.electronAPI.countFilesTokens = countFilesTokensMock;

    const { rerender } = render(<SourceTab {...createProps()} />);
    const processButton = screen.getByTestId('process-selected-files-button');

    await waitFor(() => {
      expect(processButton).toBeDisabled();
      expect(processButton).toHaveTextContent('Selecting files...');
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(countFilesTokensMock).toHaveBeenCalledWith({
      rootPath: ROOT_PATH,
      filePaths: [SELECTED_FILE],
    });

    rerender(<SourceTab {...createProps({ selectedFiles: new Set<string>([UPDATED_SELECTED_FILE]) })} />);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(countFilesTokensMock).toHaveBeenCalledWith({
      rootPath: ROOT_PATH,
      filePaths: [UPDATED_SELECTED_FILE],
    });

    await waitFor(() => {
      expect(processButton).toBeDisabled();
      expect(processButton).toHaveTextContent('Selecting files...');
    });

    await act(async () => {
      staleRequest.resolve({
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

    await act(async () => {
      await Promise.resolve();
    });

    expect(processButton).toBeDisabled();
    expect(processButton).toHaveTextContent('Selecting files...');

    await act(async () => {
      activeRequest.resolve({
        results: {
          [UPDATED_SELECTED_FILE]: 48,
        },
        stats: {
          [UPDATED_SELECTED_FILE]: {
            mtime: 1700000000001,
            size: 512,
          },
        },
      });
    });

    await waitFor(() => {
      expect(processButton).toBeEnabled();
      expect(processButton).toHaveTextContent('Process Selected Files');
    });
  });
});
