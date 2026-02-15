import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SourceTab from '../../../src/renderer/components/SourceTab';

const ROOT_PATH = '/mock/directory';
const SELECTED_FILE = `${ROOT_PATH}/src/App.tsx`;
const UPDATED_SELECTED_FILE = `${ROOT_PATH}/src/NewApp.tsx`;
const TOKEN_DEBOUNCE_MS = 300;

type FileStat = {
  mtime: number;
  size: number;
};

type TokenResponse = {
  results: Record<string, number>;
  stats: Record<string, FileStat>;
};

const FILE_STAT_INITIAL: FileStat = {
  mtime: 1700000000000,
  size: 1024,
};

const FILE_STAT_UPDATED: FileStat = {
  mtime: 1700000000100,
  size: 1024,
};

const FILE_STAT_SECONDARY: FileStat = {
  mtime: 1700000000001,
  size: 512,
};

const FILE_STAT_DELETED: FileStat = {
  mtime: 0,
  size: 0,
};

const createStatsPayload = (entries: Record<string, FileStat>) => ({
  stats: entries,
});

const createSingleFileStatsPayload = (stat: FileStat) =>
  createStatsPayload({
    [SELECTED_FILE]: stat,
  });

const createTokenPayload = (
  filePath: string,
  tokenCount: number,
  stat?: FileStat
): TokenResponse => ({
  results: {
    [filePath]: tokenCount,
  },
  stats: stat
    ? {
        [filePath]: stat,
      }
    : {},
});

function createTokenCountPromise() {
  let resolvePromise: (value: TokenResponse) => void = () => {
    throw new Error('Token count promise resolver was not initialized');
  };

  const promise = new Promise<TokenResponse>((resolve) => {
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

  const renderSingleFileSourceTab = (overrides: Partial<React.ComponentProps<typeof SourceTab>> = {}) =>
    render(<SourceTab {...createProps({ directoryTree: defaultDirectoryTree.slice(0, 1), ...overrides })} />);

  const advanceTokenDebounce = async () => {
    await act(async () => {
      jest.advanceTimersByTime(TOKEN_DEBOUNCE_MS);
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    window.electronAPI.getFilesStats = jest.fn().mockResolvedValue(
      createStatsPayload({
        [SELECTED_FILE]: FILE_STAT_INITIAL,
        [UPDATED_SELECTED_FILE]: FILE_STAT_SECONDARY,
      })
    );
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

    renderSingleFileSourceTab();

    const processButton = screen.getByTestId('process-selected-files-button');

    await waitFor(() => {
      expect(processButton).toBeDisabled();
      expect(processButton).toHaveTextContent('Selecting files...');
      expect(screen.getByTestId('process-selected-files-spinner')).toBeInTheDocument();
    });

    await advanceTokenDebounce();

    expect(countFilesTokensMock).toHaveBeenCalledWith({
      rootPath: ROOT_PATH,
      filePaths: [SELECTED_FILE],
    });

    await act(async () => {
      tokenCountPromise.resolve(createTokenPayload(SELECTED_FILE, 120, FILE_STAT_INITIAL));
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

    await advanceTokenDebounce();

    expect(countFilesTokensMock).toHaveBeenCalledWith({
      rootPath: ROOT_PATH,
      filePaths: [UPDATED_SELECTED_FILE],
    });

    await waitFor(() => {
      expect(processButton).toBeDisabled();
      expect(processButton).toHaveTextContent('Selecting files...');
    });

    await act(async () => {
      staleRequest.resolve(createTokenPayload(SELECTED_FILE, 120, FILE_STAT_INITIAL));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(processButton).toBeDisabled();
    expect(processButton).toHaveTextContent('Selecting files...');

    await act(async () => {
      activeRequest.resolve(createTokenPayload(UPDATED_SELECTED_FILE, 48, FILE_STAT_SECONDARY));
    });

    await waitFor(() => {
      expect(processButton).toBeEnabled();
      expect(processButton).toHaveTextContent('Process Selected Files');
    });
  });

  test('recounts file tokens when cached metadata becomes stale', async () => {
    const getFilesStatsMock = jest
      .fn()
      .mockResolvedValueOnce(createSingleFileStatsPayload(FILE_STAT_INITIAL))
      .mockResolvedValueOnce(createSingleFileStatsPayload(FILE_STAT_UPDATED))
      .mockResolvedValue(createSingleFileStatsPayload(FILE_STAT_UPDATED));
    const countFilesTokensMock = jest
      .fn()
      .mockResolvedValueOnce(createTokenPayload(SELECTED_FILE, 120, FILE_STAT_INITIAL))
      .mockResolvedValueOnce(createTokenPayload(SELECTED_FILE, 145, FILE_STAT_UPDATED));

    window.electronAPI.getFilesStats = getFilesStatsMock;
    window.electronAPI.countFilesTokens = countFilesTokensMock;

    renderSingleFileSourceTab();
    await advanceTokenDebounce();

    await waitFor(() => {
      expect(countFilesTokensMock).toHaveBeenCalledTimes(1);
    });

    await advanceTokenDebounce();

    await waitFor(() => {
      expect(countFilesTokensMock).toHaveBeenCalledTimes(2);
    });
  });

  test('does not recount file tokens when metadata is unchanged', async () => {
    const getFilesStatsMock = jest.fn().mockResolvedValue(createSingleFileStatsPayload(FILE_STAT_INITIAL));
    const countFilesTokensMock = jest
      .fn()
      .mockResolvedValue(createTokenPayload(SELECTED_FILE, 120, FILE_STAT_INITIAL));

    window.electronAPI.getFilesStats = getFilesStatsMock;
    window.electronAPI.countFilesTokens = countFilesTokensMock;

    renderSingleFileSourceTab();
    await advanceTokenDebounce();

    await waitFor(() => {
      expect(countFilesTokensMock).toHaveBeenCalledTimes(1);
    });

    await advanceTokenDebounce();

    expect(countFilesTokensMock).toHaveBeenCalledTimes(1);
  });

  test('handles deleted file by recounting to zero and stabilizing cache state', async () => {
    const getFilesStatsMock = jest
      .fn()
      .mockResolvedValueOnce(createSingleFileStatsPayload(FILE_STAT_INITIAL))
      .mockResolvedValueOnce(createSingleFileStatsPayload(FILE_STAT_DELETED))
      .mockResolvedValue(createSingleFileStatsPayload(FILE_STAT_DELETED));
    const countFilesTokensMock = jest
      .fn()
      .mockResolvedValueOnce(createTokenPayload(SELECTED_FILE, 120, FILE_STAT_INITIAL))
      .mockResolvedValueOnce(createTokenPayload(SELECTED_FILE, 0));

    window.electronAPI.getFilesStats = getFilesStatsMock;
    window.electronAPI.countFilesTokens = countFilesTokensMock;

    renderSingleFileSourceTab();
    await advanceTokenDebounce();

    await waitFor(() => {
      expect(countFilesTokensMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Tokens').parentElement).toHaveTextContent('120');
    });

    await advanceTokenDebounce();

    await waitFor(() => {
      expect(countFilesTokensMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Tokens').parentElement).toHaveTextContent('0');
    });

    await advanceTokenDebounce();

    expect(countFilesTokensMock).toHaveBeenCalledTimes(2);
  });
});
