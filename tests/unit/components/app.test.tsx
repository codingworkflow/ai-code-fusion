import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// IMPORTANT: Mock child components BEFORE importing App
// Mock child components as real functions returning JSX, not just jest.fn()
jest.mock('../../../src/renderer/components/TabBar', () => {
  // Import PropTypes inside the factory function to avoid ReferenceError
  const PropTypes = require('prop-types');

  // Return an actual function component
  const MockTabBar = ({ activeTab, onTabChange }) => {
    return (
      <div data-testid='mock-tabbar'>
        <button onClick={() => onTabChange('config')} data-active={activeTab === 'config'}>
          Config
        </button>
        <button onClick={() => onTabChange('source')} data-active={activeTab === 'source'}>
          Source
        </button>
        <button onClick={() => onTabChange('processed')} data-active={activeTab === 'processed'}>
          Processed
        </button>
      </div>
    );
  };

  MockTabBar.propTypes = {
    activeTab: PropTypes.string.isRequired,
    onTabChange: PropTypes.func.isRequired,
  };

  // Use __esModule: true and default property to match ES module default export
  return { __esModule: true, default: MockTabBar };
});

jest.mock('../../../src/renderer/components/ConfigTab', () => {
  // Import PropTypes inside the factory function to avoid ReferenceError
  const PropTypes = require('prop-types');

  const MockConfigTab = ({ configContent, onConfigChange }) => {
    return (
      <div data-testid='mock-config-tab'>
        <textarea
          data-testid='config-content'
          value={configContent}
          onChange={(e) => onConfigChange(e.target.value)}
        />
      </div>
    );
  };

  MockConfigTab.propTypes = {
    configContent: PropTypes.string.isRequired,
    onConfigChange: PropTypes.func.isRequired,
  };

  // Use __esModule: true and default property to match ES module default export
  return { __esModule: true, default: MockConfigTab };
});

jest.mock('../../../src/renderer/components/SourceTab', () => {
  // Import PropTypes inside the factory function to avoid ReferenceError
  const PropTypes = require('prop-types');

  const MockSourceTab = ({
    rootPath,
    selectedFiles,
    onDirectorySelect,
    onAnalyze,
    onFileSelect,
  }) => {
    return (
      <div data-testid='mock-source-tab'>
        <div data-testid='root-path'>{rootPath}</div>
        <button data-testid='select-directory-btn' onClick={onDirectorySelect}>
          Select Directory
        </button>
        <button
          data-testid='analyze-btn'
          onClick={() => {
            Promise.resolve(onAnalyze()).catch(() => {});
          }}
        >
          Analyze
        </button>
        <div data-testid='selected-files-count'>{selectedFiles.length}</div>
        <button
          data-testid='mock-select-file-btn'
          onClick={() => onFileSelect && onFileSelect('/mock/directory/src/file1.js', true)}
        >
          Select File
        </button>
      </div>
    );
  };

  MockSourceTab.propTypes = {
    rootPath: PropTypes.string,
    selectedFiles: PropTypes.array.isRequired,
    onDirectorySelect: PropTypes.func.isRequired,
    onAnalyze: PropTypes.func.isRequired,
    onFileSelect: PropTypes.func,
  };

  // Use __esModule: true and default property to match ES module default export
  return { __esModule: true, default: MockSourceTab };
});

jest.mock('../../../src/renderer/components/ProcessedTab', () => {
  // Import PropTypes inside the factory function to avoid ReferenceError
  const PropTypes = require('prop-types');

  const MockProcessedTab = ({ processedResult, onSave, onRefresh }) => {
    return (
      <div data-testid='mock-processed-tab'>
        <div data-testid='processed-content'>
          {processedResult ? processedResult.content : 'No content'}
        </div>
        <button data-testid='save-btn' onClick={onSave}>
          Save
        </button>
        <button data-testid='refresh-btn' onClick={onRefresh}>
          Refresh
        </button>
      </div>
    );
  };

  MockProcessedTab.propTypes = {
    processedResult: PropTypes.shape({
      content: PropTypes.string,
    }),
    onSave: PropTypes.func.isRequired,
    onRefresh: PropTypes.func.isRequired,
  };

  // Use __esModule: true and default property to match ES module default export
  return { __esModule: true, default: MockProcessedTab };
});

// IMPORTANT: Only import App AFTER all mocks are set up
import App from '../../../src/renderer/components/App';

// Mock the electronAPI for Electron's IPC
window.electronAPI = {
  selectDirectory: jest.fn().mockResolvedValue('/mock/directory'),
  getDirectoryTree: jest.fn().mockResolvedValue([
    {
      name: 'src',
      path: '/mock/directory/src',
      type: 'directory',
      children: [
        {
          name: 'file1.js',
          path: '/mock/directory/src/file1.js',
          type: 'file',
        },
      ],
    },
  ]),
  saveFile: jest.fn().mockResolvedValue('/mock/output.md'),
  resetGitignoreCache: jest.fn().mockResolvedValue(true),
  analyzeRepository: jest.fn().mockResolvedValue({
    filesInfo: [
      { path: 'file1.js', tokens: 100 },
      { path: 'file2.js', tokens: 200 },
    ],
    totalTokens: 300,
  }),
  processRepository: jest.fn().mockResolvedValue({
    content: 'Processed content',
    exportFormat: 'markdown',
    totalTokens: 300,
    processedFiles: 2,
    skippedFiles: 0,
  }),
  getDefaultConfig: jest.fn().mockResolvedValue('# Default config'),
  getAssetPath: jest.fn().mockResolvedValue('/mock/assets/image.png'),
  countFilesTokens: jest.fn().mockResolvedValue({
    results: { '/mock/file1.js': 100 },
    stats: { '/mock/file1.js': { size: 1000, mtime: Date.now() } },
  }),
};

// Mock the electron shell
window.electron = {
  shell: {
    openExternal: jest.fn(),
  },
};

// Mock localStorage with a resettable in-memory store
let localStorageStore = {};
const localStorageMock = {
  getItem: jest.fn((key) =>
    Object.prototype.hasOwnProperty.call(localStorageStore, key) ? localStorageStore[key] : null
  ),
  setItem: jest.fn((key, value) => {
    localStorageStore[key] = value.toString();
  }),
  clear: jest.fn(() => {
    localStorageStore = {};
  }),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window functions
window.dispatchEvent = jest.fn();
window.alert = jest.fn();

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageStore = {};
    localStorage.getItem.mockImplementation((key) =>
      Object.prototype.hasOwnProperty.call(localStorageStore, key) ? localStorageStore[key] : null
    );
    localStorage.setItem.mockImplementation((key, value) => {
      localStorageStore[key] = value.toString();
    });
    localStorage.clear.mockImplementation(() => {
      localStorageStore = {};
    });
    localStorage.clear();
  });

  test('renders with default config tab active', () => {
    render(<App />);

    // Check if config tab is active initially
    const tabElements = screen.getAllByRole('button');
    const configTab = tabElements.find((el) => el.textContent === 'Config');
    expect(configTab).toHaveAttribute('data-active', 'true');

    // Config tab content should be visible
    expect(screen.getByTestId('mock-config-tab')).toBeInTheDocument();
  });

  test('changes tab when tab button is clicked', () => {
    render(<App />);

    // Initial state - config tab active
    expect(screen.getByTestId('mock-config-tab')).toBeInTheDocument();

    // Click source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    // Source tab should be active
    expect(sourceTab).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('mock-source-tab')).toBeInTheDocument();
  });

  test('loads config from localStorage on mount', async () => {
    // Setup localStorage
    const mockConfig = '# Test config\nuse_custom_excludes: true';
    localStorage.getItem.mockReturnValue(mockConfig);

    render(<App />);

    // Wait for useEffect to complete
    await waitFor(() => {
      const configContent = screen.getByTestId('config-content');
      expect(configContent.value).toBe(mockConfig);
    });

    expect(localStorage.getItem).toHaveBeenCalledWith('configContent');
  });

  test('loads default config if localStorage is empty', async () => {
    // Setup mocks
    localStorage.getItem.mockReturnValue(null); // No stored config
    window.electronAPI.getDefaultConfig.mockResolvedValue('# Default config');

    render(<App />);

    // Wait for useEffect to complete
    await waitFor(() => {
      expect(window.electronAPI.getDefaultConfig).toHaveBeenCalled();
      const configContent = screen.getByTestId('config-content');
      expect(configContent.value).toBe('# Default config');
    });
  });

  test('updates rootPath when directory is selected', async () => {
    render(<App />);

    // Click to source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    // Click select directory button
    const selectDirBtn = screen.getByTestId('select-directory-btn');

    await act(async () => {
      fireEvent.click(selectDirBtn);
      // Wait for promise to resolve
      await Promise.resolve();
    });

    // Check if rootPath is updated
    expect(window.electronAPI.selectDirectory).toHaveBeenCalled();
    expect(screen.getByTestId('root-path').textContent).toBe('/mock/directory');
    expect(localStorage.setItem).toHaveBeenCalledWith('rootPath', '/mock/directory');
  });

  test('analyzes repository and switches to processed tab', async () => {
    // Setup
    localStorage.setItem('rootPath', '/mock/directory');
    window.electronAPI.getDirectoryTree.mockResolvedValue([
      {
        name: 'src',
        path: '/mock/directory/src',
        type: 'directory',
        children: [
          {
            name: 'file1.js',
            path: '/mock/directory/src/file1.js',
            type: 'file',
          },
        ],
      },
    ]);

    // Render the component
    render(<App />);

    // Go to source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    // Click the mock select file button to trigger file selection
    const selectFileBtn = screen.getByTestId('mock-select-file-btn');
    fireEvent.click(selectFileBtn);

    // Verify selectedFiles count updated
    const selectedFilesCount = screen.getByTestId('selected-files-count');
    expect(selectedFilesCount.textContent).toBe('1');

    // Click analyze button
    const analyzeBtn = screen.getByTestId('analyze-btn');
    await act(async () => {
      fireEvent.click(analyzeBtn);
      // Wait for API calls to complete
      await waitFor(() => window.electronAPI.processRepository.mock.calls.length > 0);
    });

    // Check that API calls were made
    expect(window.electronAPI.analyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: '/mock/directory',
        selectedFiles: ['/mock/directory/src/file1.js'],
      })
    );
    expect(window.electronAPI.processRepository).toHaveBeenCalled();
    expect(window.electronAPI.processRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          exportFormat: 'markdown',
        }),
      })
    );

    // Verify tab switch
    const processedTab = tabElements.find((el) => el.textContent === 'Processed');
    expect(processedTab).toHaveAttribute('data-active', 'true');

    // Verify processed content is shown
    expect(screen.getByTestId('processed-content').textContent).toBe('Processed content');
  });

  test('should save processed content when save button is clicked', async () => {
    // Mock API responses
    window.electronAPI.processRepository.mockResolvedValue({
      content: 'Test processed content',
      exportFormat: 'markdown',
      totalTokens: 300,
      processedFiles: 2,
      skippedFiles: 0,
    });

    // Setup root path
    localStorage.setItem('rootPath', '/mock/directory');

    // Render the App
    render(<App />);

    // First setup the processed state by simulating the workflow

    // Go to source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    // Select a file through the mock button
    const selectFileBtn = screen.getByTestId('mock-select-file-btn');
    fireEvent.click(selectFileBtn);

    // Run analysis
    const analyzeBtn = screen.getByTestId('analyze-btn');
    await act(async () => {
      fireEvent.click(analyzeBtn);
      await waitFor(() => window.electronAPI.processRepository.mock.calls.length > 0);
    });

    // Now we should be on the processed tab with content
    expect(screen.getByTestId('mock-processed-tab')).toBeInTheDocument();

    // Find and click save button
    const saveBtn = screen.getByTestId('save-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
      await waitFor(() => window.electronAPI.saveFile.mock.calls.length > 0);
    });

    // Verify save was called correctly
    expect(window.electronAPI.saveFile).toHaveBeenCalledWith({
      content: 'Test processed content',
      defaultPath: '/mock/directory/output.md',
    });
  });

  test('uses xml export format for processing and save path when configured', async () => {
    window.electronAPI.processRepository.mockResolvedValue({
      content: '<repositoryContent><files /></repositoryContent>',
      exportFormat: 'xml',
      totalTokens: 300,
      processedFiles: 2,
      skippedFiles: 0,
    });

    localStorage.setItem('rootPath', '/mock/directory');
    localStorage.setItem(
      'configContent',
      ['export_format: xml', 'include_tree_view: true', 'show_token_count: true'].join('\n')
    );

    render(<App />);

    await waitFor(() => {
      expect((screen.getByTestId('config-content') as HTMLTextAreaElement).value).toContain(
        'export_format: xml'
      );
    });

    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    const selectFileBtn = screen.getByTestId('mock-select-file-btn');
    fireEvent.click(selectFileBtn);

    const analyzeBtn = screen.getByTestId('analyze-btn');
    await act(async () => {
      fireEvent.click(analyzeBtn);
      await waitFor(() => window.electronAPI.processRepository.mock.calls.length > 0);
    });

    expect(window.electronAPI.processRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          exportFormat: 'xml',
        }),
      })
    );

    const saveBtn = screen.getByTestId('save-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
      await waitFor(() => window.electronAPI.saveFile.mock.calls.length > 0);
    });

    expect(window.electronAPI.saveFile).toHaveBeenCalledWith({
      content: '<repositoryContent><files /></repositoryContent>',
      defaultPath: '/mock/directory/output.xml',
    });
  });

  test('defaults showTokenCount to false when config omits show_token_count', async () => {
    localStorage.setItem('rootPath', '/mock/directory');
    localStorage.setItem(
      'configContent',
      ['export_format: markdown', 'include_tree_view: false'].join('\n')
    );

    render(<App />);

    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    fireEvent.click(screen.getByTestId('mock-select-file-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('analyze-btn'));
      await waitFor(() => window.electronAPI.processRepository.mock.calls.length > 0);
    });

    expect(window.electronAPI.processRepository).toHaveBeenLastCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          showTokenCount: false,
          exportFormat: 'markdown',
        }),
      })
    );
  });

  test('saves using processed result format even if config changes later', async () => {
    window.electronAPI.processRepository.mockResolvedValue({
      content: 'Processed markdown content',
      exportFormat: 'markdown',
      totalTokens: 120,
      processedFiles: 1,
      skippedFiles: 0,
    });

    localStorage.setItem('rootPath', '/mock/directory');
    localStorage.setItem(
      'configContent',
      ['export_format: markdown', 'include_tree_view: false', 'show_token_count: true'].join('\n')
    );

    render(<App />);

    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    fireEvent.click(screen.getByTestId('mock-select-file-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('analyze-btn'));
      await waitFor(() => window.electronAPI.processRepository.mock.calls.length > 0);
    });

    const configTab = tabElements.find((el) => el.textContent === 'Config');
    fireEvent.click(configTab);

    fireEvent.change(screen.getByTestId('config-content'), {
      target: {
        value: ['export_format: xml', 'include_tree_view: false', 'show_token_count: true'].join(
          '\n'
        ),
      },
    });

    const processedTab = tabElements.find((el) => el.textContent === 'Processed');
    fireEvent.click(processedTab);

    await act(async () => {
      fireEvent.click(screen.getByTestId('save-btn'));
      await waitFor(() => window.electronAPI.saveFile.mock.calls.length > 0);
    });

    expect(window.electronAPI.saveFile).toHaveBeenCalledWith({
      content: 'Processed markdown content',
      defaultPath: '/mock/directory/output.md',
    });
  });

  test('handles error when repository analysis fails', async () => {
    // Setup
    jest.clearAllMocks();
    localStorage.setItem('rootPath', '/mock/directory');

    // Mock API to reject with error
    window.electronAPI.analyzeRepository.mockRejectedValueOnce(new Error('Analysis failed'));

    // Spy on window.alert
    jest.spyOn(window, 'alert').mockImplementation(() => {});

    // Render the App
    render(<App />);

    // Go to source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find((el) => el.textContent === 'Source');
    fireEvent.click(sourceTab);

    // Select a file through the mock button
    const selectFileBtn = screen.getByTestId('mock-select-file-btn');
    fireEvent.click(selectFileBtn);

    // Click analyze button
    const analyzeBtn = screen.getByTestId('analyze-btn');
    await act(async () => {
      fireEvent.click(analyzeBtn);
      // Wait for alert to be shown
      await waitFor(() => expect(window.alert).toHaveBeenCalled());
    });

    // Verify API call and error handling
    expect(window.electronAPI.analyzeRepository).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(
      expect.stringContaining('Error processing repository: Analysis failed')
    );

    // Ensure we didn't switch to processed tab
    expect(screen.getByTestId('mock-source-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-processed-tab')).not.toBeInTheDocument();

    // Cleanup
    window.alert.mockRestore();
  });
});
