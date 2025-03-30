import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ConfigTab from '../../../src/renderer/components/ConfigTab';
import * as listFormatter from '../../../src/utils/formatters/list-formatter';

// Mock the list formatter
jest.mock('../../../src/utils/formatters/list-formatter', () => ({
  yamlArrayToPlainText: jest.fn((arr) => (arr || []).join('\n')),
  plainTextToYamlArray: jest.fn((text) => text ? text.split('\n').filter(Boolean) : [])
}));

// Mock yaml package
jest.mock('yaml', () => ({
  parse: jest.fn().mockImplementation(str => {
    if (str && str.includes('include_extensions')) {
      return {
        include_extensions: ['.js', '.jsx'],
        use_custom_excludes: true,
        use_gitignore: true,
        use_custom_includes: true
      };
    }
    return {};
  }),
  stringify: jest.fn().mockReturnValue('mocked yaml string')
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock electronAPI
window.electronAPI = {
  selectDirectory: jest.fn().mockResolvedValue('/mock/directory')
};

// Mock alert and custom events
window.alert = jest.fn();
window.dispatchEvent = jest.fn();
window.switchToTab = jest.fn();

describe('ConfigTab', () => {
  const mockConfigContent = '# Test configuration\ninclude_extensions:\n  - .js\n  - .jsx';
  const mockOnConfigChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('/mock/saved/path');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('renders inputs and checkboxes correctly', () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    // Check folder input
    const folderInput = screen.getByPlaceholderText('Select a root folder');
    expect(folderInput).toBeInTheDocument();
    expect(folderInput).toHaveValue('/mock/saved/path');
    
    // Check checkboxes are rendered
    expect(screen.getByLabelText('Filter by file extensions')).toBeChecked();
    expect(screen.getByLabelText('Use exclude patterns')).toBeChecked();
    expect(screen.getByLabelText('Apply .gitignore rules')).toBeChecked();
    
    // Check textareas
    const extensionsTextarea = screen.getByPlaceholderText(/\.py/);
    expect(extensionsTextarea).toBeInTheDocument();
    expect(extensionsTextarea).toHaveValue('.js\n.jsx');
  });

  test('calls onConfigChange when checkbox changes', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const excludePatternCheckbox = screen.getByLabelText('Use exclude patterns');
    
    act(() => {
      fireEvent.click(excludePatternCheckbox);
      jest.advanceTimersByTime(100); // Advance past the debounce
    });
    
    // onConfigChange should be called after the debounce
    await waitFor(() => {
      expect(mockOnConfigChange).toHaveBeenCalled();
    });
  });

  test('calls selectDirectory when folder button is clicked', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const selectFolderButton = screen.getByText('Select Folder');
    
    act(() => {
      fireEvent.click(selectFolderButton);
    });
    
    await waitFor(() => {
      expect(window.electronAPI.selectDirectory).toHaveBeenCalled();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('rootPath', '/mock/directory');
    });
  });
});
