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
type TokenSequenceEntry = {
  tokenCount: number;
  stat?: FileStat;
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

  const createResolvedSequenceMock = <T,>(values: T[]) => {
    const mock = jest.fn();
    values.forEach((value, index) => {
      if (index === values.length - 1) {
        mock.mockResolvedValue(value);
        return;
      }
      mock.mockResolvedValueOnce(value);
    });
    return mock;
  };

  const setupSingleFileTokenScenario = (
    statsSequence: FileStat[],
    tokenSequence: TokenSequenceEntry[]
  ) => {
    const getFilesStatsMock = createResolvedSequenceMock(
      statsSequence.map((stat) => createSingleFileStatsPayload(stat))
    );
    const countFilesTokensMock = createResolvedSequenceMock(
      tokenSequence.map(({ tokenCount, stat }) => createTokenPayload(SELECTED_FILE, tokenCount, stat))
    );

    window.electronAPI.getFilesStats = getFilesStatsMock;
    window.electronAPI.countFilesTokens = countFilesTokensMock;

    return { getFilesStatsMock, countFilesTokensMock };
  };

  const getTokenSummaryElement = () => screen.getByText('Tokens').parentElement;

  const advanceAndAssertTokenState = async (
    countFilesTokensMock: jest.Mock,
    expectedCalls: number,
    expectedTokenTotal: string
  ) => {
    await advanceTokenDebounce();
    await waitFor(() => {
      expect(countFilesTokensMock).toHaveBeenCalledTimes(expectedCalls);
      expect(getTokenSummaryElement()).toHaveTextContent(expectedTokenTotal);
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
    const { countFilesTokensMock } = setupSingleFileTokenScenario(
      [FILE_STAT_INITIAL, FILE_STAT_UPDATED],
      [
        { tokenCount: 120, stat: FILE_STAT_INITIAL },
        { tokenCount: 145, stat: FILE_STAT_UPDATED },
      ]
    );

    renderSingleFileSourceTab();
    await advanceAndAssertTokenState(countFilesTokensMock, 1, '120');
    await advanceAndAssertTokenState(countFilesTokensMock, 2, '145');
  });

  test('does not recount file tokens when metadata is unchanged', async () => {
    const { countFilesTokensMock } = setupSingleFileTokenScenario([FILE_STAT_INITIAL], [
      { tokenCount: 120, stat: FILE_STAT_INITIAL },
    ]);

    renderSingleFileSourceTab();
    await advanceAndAssertTokenState(countFilesTokensMock, 1, '120');
    await advanceAndAssertTokenState(countFilesTokensMock, 1, '120');
  });

  test('handles deleted file by recounting to zero and stabilizing cache state', async () => {
    const { countFilesTokensMock } = setupSingleFileTokenScenario(
      [FILE_STAT_INITIAL, FILE_STAT_DELETED],
      [
        { tokenCount: 120, stat: FILE_STAT_INITIAL },
        { tokenCount: 0 },
      ]
    );

    renderSingleFileSourceTab();
    await advanceAndAssertTokenState(countFilesTokensMock, 1, '120');
    await advanceAndAssertTokenState(countFilesTokensMock, 2, '0');

    await advanceTokenDebounce();

    expect(countFilesTokensMock).toHaveBeenCalledTimes(2);
  });
});
