import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from '../../../src/renderer/components/App';
import '@testing-library/jest-dom';

// Mock child components to simplify testing
jest.mock('../../../src/renderer/components/TabBar', () => {
  return function MockTabBar({ activeTab, onTabChange }) {
    return (
      <div data-testid="mock-tabbar">
        <button onClick={() => onTabChange('config')} data-active={activeTab === 'config'}>Config</button>
        <button onClick={() => onTabChange('source')} data-active={activeTab === 'source'}>Source</button>
        <button onClick={() => onTabChange('processed')} data-active={activeTab === 'processed'}>Processed</button>
      </div>
    );
  };
});

jest.mock('../../../src/renderer/components/ConfigTab', () => {
  return function MockConfigTab({ configContent, onConfigChange }) {
    return (
      <div data-testid="mock-config-tab">
        <textarea 
          data-testid="config-content" 
          value={configContent}
          onChange={(e) => onConfigChange(e.target.value)}
        />
      </div>
    );
  };
});

jest.mock('../../../src/renderer/components/SourceTab', () => {
  return function MockSourceTab({ 
    rootPath, 
    directoryTree, 
    selectedFiles,
    onDirectorySelect,
    onFileSelect,
    onAnalyze
  }) {
    return (
      <div data-testid="mock-source-tab">
        <div data-testid="root-path">{rootPath}</div>
        <button 
          data-testid="select-directory-btn" 
          onClick={onDirectorySelect}
        >
          Select Directory
        </button>
        <button 
          data-testid="analyze-btn" 
          onClick={onAnalyze}
        >
          Analyze
        </button>
        <div data-testid="selected-files-count">{selectedFiles.length}</div>
      </div>
    );
  };
});

jest.mock('../../../src/renderer/components/ProcessedTab', () => {
  return function MockProcessedTab({ processedResult, onSave, onRefresh }) {
    return (
      <div data-testid="mock-processed-tab">
        <div data-testid="processed-content">
          {processedResult ? processedResult.content : 'No content'}
        </div>
        <button data-testid="save-btn" onClick={onSave}>Save</button>
        <button data-testid="refresh-btn" onClick={onRefresh}>Refresh</button>
      </div>
    );
  };
});

// Mock the electronAPI
window.electronAPI = {
  selectDirectory: jest.fn().mockResolvedValue('/mock/directory'),
  getDirectoryTree: jest.fn().mockResolvedValue([]),
  saveFile: jest.fn().mockResolvedValue('/mock/output.md'),
  resetGitignoreCache: jest.fn().mockResolvedValue(true),
  analyzeRepository: jest.fn().mockResolvedValue({
    filesInfo: [
      { path: 'file1.js', tokens: 100 },
      { path: 'file2.js', tokens: 200 }
    ],
    totalTokens: 300
  }),
  processRepository: jest.fn().mockResolvedValue({
    content: 'Processed content',
    totalTokens: 300,
    processedFiles: 2,
    skippedFiles: 0
  }),
  getDefaultConfig: jest.fn().mockResolvedValue('# Default config'),
  getAssetPath: jest.fn().mockResolvedValue('/mock/assets/image.png'),
  countFilesTokens: jest.fn().mockResolvedValue({
    results: { '/mock/file1.js': 100 },
    stats: { '/mock/file1.js': { size: 1000, mtime: Date.now() } }
  })
};

// Mock the electron shell
window.electron = {
  shell: {
    openExternal: jest.fn()
  }
};

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock window functions
window.dispatchEvent = jest.fn();
window.alert = jest.fn();

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test('renders with default config tab active', () => {
    render(<App />);
    
    // Check if config tab is active initially
    const tabElements = screen.getAllByRole('button');
    const configTab = tabElements.find(el => el.textContent === 'Config');
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
    const sourceTab = tabElements.find(el => el.textContent === 'Source');
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
    const sourceTab = tabElements.find(el => el.textContent === 'Source');
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
    // Setup mocks
    localStorage.setItem('rootPath', '/mock/directory');
    
    // Create a mock implementation of App component with selectedFiles state pre-populated
    const AppWithSelectedFiles = () => {
      const app = <App />;
      // After rendering, directly access and modify the App component's state
      setTimeout(() => {
        // Find the onFileSelect callback in the SourceTab props and call it
        // This simulates selecting files through the UI
        const sourceTabProps = jest.requireMock('../../../src/renderer/components/SourceTab').default.mock.calls[0][0];
        if (sourceTabProps.onFileSelect) {
          sourceTabProps.onFileSelect('/mock/directory/src/file1.js', true);
          sourceTabProps.onFileSelect('/mock/directory/package.json', true);
        }
      }, 0);
      return app;
    };
    
    // Render with our custom wrapper that sets up selected files
    render(<AppWithSelectedFiles />);
    
    // Switch to source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find(el => el.textContent === 'Source');
    fireEvent.click(sourceTab);
    
    // Ensure the mocked SourceTab component can report selected files
    const mockSourceTab = jest.requireMock('../../../src/renderer/components/SourceTab').default;
    mockSourceTab.mockImplementation(props => {
      // Update the original implementation to show selectedFiles
      const result = React.createElement('div', {
        'data-testid': 'mock-source-tab'
      }, [
        React.createElement('div', { 'data-testid': 'root-path', key: 'root-path' }, props.rootPath || ''),
        React.createElement('button', { 
          'data-testid': 'select-directory-btn', 
          onClick: props.onDirectorySelect,
          key: 'select-dir-btn'
        }, 'Select Directory'),
        React.createElement('button', { 
          'data-testid': 'analyze-btn', 
          onClick: props.onAnalyze,
          key: 'analyze-btn'
        }, 'Analyze'),
        // Show the actual length of selectedFiles from props
        React.createElement('div', { 
          'data-testid': 'selected-files-count',
          key: 'selected-files-count'
        }, props.selectedFiles.length.toString())
      ]);
      return result;
    });
    
    // Wait for our selected files to be set up
    await waitFor(() => {
      const selectedFilesCount = screen.getByTestId('selected-files-count');
      return selectedFilesCount.textContent !== '0';
    });
    
    // Click analyze button
    const analyzeBtn = screen.getByTestId('analyze-btn');
    
    await act(async () => {
      fireEvent.click(analyzeBtn);
      // Wait for the analyze process to complete
      await waitFor(() => {
        return window.electronAPI.analyzeRepository.mock.calls.length > 0;
      });
    });
    
    // Check if proper API calls were made
    expect(window.electronAPI.analyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        rootPath: '/mock/directory',
        selectedFiles: expect.any(Array)
      })
    );
    expect(window.electronAPI.processRepository).toHaveBeenCalled();
    
    // Check that we switched to processed tab
    await waitFor(() => {
      const processedTab = screen.getByText('Processed');
      return processedTab.getAttribute('data-active') === 'true';
    });
    
    // Verify the processed content is shown
    expect(screen.getByTestId('processed-content').textContent).toBe('Processed content');
  });

  test('should save processed content when save button is clicked', async () => {
    // Setup - mock ProcessedTab to explicitly add save button with data-testid
    jest.requireMock('../../../src/renderer/components/ProcessedTab').default = function MockProcessedTab({ processedResult, onSave }) {
      return (
        <div data-testid="mock-processed-tab">
          <div data-testid="processed-content">
            {processedResult ? processedResult.content : 'No content'}
          </div>
          <button data-testid="save-btn" onClick={onSave}>Save</button>
        </div>
      );
    };
    
    // Mock the processRepository to return content we can save
    window.electronAPI.processRepository.mockResolvedValue({
      content: 'Test processed content',
      totalTokens: 300,
      processedFiles: 2,
      skippedFiles: 0
    });

    // Setup root path
    localStorage.setItem('rootPath', '/mock/directory');
    
    // Create a specialized render setup for this test
    const { rerender } = render(<App />);
    
    // Directly set app to processed tab with content (skipping the file selection flow)
    rerender(
      <App 
        initialActiveTab="processed" 
        initialProcessedResult={{
          content: 'Test processed content',
          totalTokens: 300,
          processedFiles: 2,
          skippedFiles: 0
        }}
      />
    );
    
    // Verify we're on the processed tab
    await waitFor(() => {
      return screen.getByTestId('mock-processed-tab');
    });
    
    // Find the save button
    const saveBtn = screen.getByTestId('save-btn');
    
    // Click save button
    await act(async () => {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        return window.electronAPI.saveFile.mock.calls.length > 0;
      });
    });
    
    // Check if save was called with the correct parameters
    expect(window.electronAPI.saveFile).toHaveBeenCalledWith({
      content: expect.any(String),
      defaultPath: expect.stringContaining('/mock/directory')
    });
  });

  test('handles error when repository analysis fails', async () => {
    // Setup - ensure all mocks are reset
    jest.clearAllMocks();
    
    // Setup common mocks
    localStorage.setItem('rootPath', '/mock/directory');
    
    // Mock analyzeRepository to reject with specific error
    window.electronAPI.analyzeRepository.mockRejectedValueOnce(new Error('Analysis failed'));
    
    // Create a mock implementation of App component with selectedFiles state pre-populated
    const AppWithSelectedFiles = () => {
      const app = <App />;
      // After rendering, directly access and modify the App component's state
      setTimeout(() => {
        // Find the onFileSelect callback in the SourceTab props and call it
        const sourceTabProps = jest.requireMock('../../../src/renderer/components/SourceTab').default.mock.calls[0][0];
        if (sourceTabProps.onFileSelect) {
          sourceTabProps.onFileSelect('/mock/directory/src/file1.js', true);
        }
      }, 0);
      return app;
    };
    
    // Render with our custom wrapper that sets up selected files
    render(<AppWithSelectedFiles />);
    
    // Switch to source tab
    const tabElements = screen.getAllByRole('button');
    const sourceTab = tabElements.find(el => el.textContent === 'Source');
    fireEvent.click(sourceTab);
    
    // Wait for selected files to be set
    await waitFor(() => {
      const selectedFilesCount = screen.getByTestId('selected-files-count');
      return selectedFilesCount.textContent === '1';
    });
    
    // Click analyze button
    const analyzeBtn = screen.getByTestId('analyze-btn');
    
    // Track if alert was called
    let alertCalled = false;
    const originalAlert = window.alert;
    window.alert = jest.fn().mockImplementation((message) => {
      alertCalled = true;
      return originalAlert(message);
    });
    
    await act(async () => {
      fireEvent.click(analyzeBtn);
      
      // Wait for alert to be shown
      await waitFor(() => alertCalled);
    });
    
    // Restore original alert
    window.alert = originalAlert;
    
    // Verify the error handling
    expect(window.electronAPI.analyzeRepository).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Error processing repository: Analysis failed'));
    
    // Check we didn't switch to processed tab
    expect(screen.getByTestId('mock-source-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-processed-tab')).not.toBeInTheDocument();
  });
});
