import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import App from '../../../src/renderer/components/App';

const ROOT_PATH = '/mock/directory';
const FILE_PATH = `${ROOT_PATH}/index.ts`;

describe('App SourceTab activity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    localStorage.clear();
    localStorage.setItem('rootPath', ROOT_PATH);
    localStorage.setItem('configContent', 'show_token_count: true');

    window.electronAPI = {
      selectDirectory: jest.fn().mockResolvedValue(ROOT_PATH),
      getDirectoryTree: jest.fn().mockResolvedValue([
        {
          name: 'index.ts',
          path: FILE_PATH,
          type: 'file',
        },
      ]),
      saveFile: jest.fn().mockResolvedValue('/mock/output.md'),
      resetGitignoreCache: jest.fn().mockResolvedValue(true),
      analyzeRepository: jest.fn().mockResolvedValue({
        filesInfo: [{ path: FILE_PATH, tokens: 12 }],
        totalTokens: 12,
      }),
      processRepository: jest.fn().mockResolvedValue({
        content: 'processed',
        exportFormat: 'markdown',
        totalTokens: 12,
        processedFiles: 1,
        skippedFiles: 0,
      }),
      getDefaultConfig: jest.fn().mockResolvedValue('show_token_count: true'),
      getAssetPath: jest.fn().mockResolvedValue(null),
      getFilesStats: jest.fn().mockResolvedValue({
        stats: { [FILE_PATH]: { size: 42, mtime: 1700000000000 } },
      }),
      countFilesTokens: jest.fn().mockResolvedValue({
        results: { [FILE_PATH]: 12 },
        stats: { [FILE_PATH]: { size: 42, mtime: 1700000000000 } },
      }),
      getUpdaterStatus: jest.fn().mockResolvedValue({
        state: 'idle',
        enabled: false,
        checkOnStart: false,
        prereleaseChannel: false,
        owner: 'codingworkflow',
        repo: 'ai-code-fusion',
      }),
      checkForUpdates: jest.fn().mockResolvedValue({
        state: 'idle',
        enabled: false,
        checkOnStart: false,
        prereleaseChannel: false,
        owner: 'codingworkflow',
        repo: 'ai-code-fusion',
        updateAvailable: false,
      }),
      testProviderConnection: jest.fn().mockResolvedValue({
        ok: true,
        message: 'ok',
      }),
    };

    window.electron = {
      shell: {
        openExternal: jest.fn(),
      },
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('does not run token counting while Source tab is inactive', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('tab-source'));

    const fileTreeItem = await screen.findByRole('treeitem', { name: /index\.ts/i });
    fireEvent.click(fileTreeItem);

    fireEvent.click(screen.getByTestId('tab-config'));

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(window.electronAPI.countFilesTokens).not.toHaveBeenCalled();
    });
  });
});
