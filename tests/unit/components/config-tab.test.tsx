import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock useApp from AppContext
const mockSelectDirectory = jest.fn().mockResolvedValue(true);
const mockSwitchTab = jest.fn();

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({
    rootPath: '/mock/saved/path',
    selectDirectory: mockSelectDirectory,
    switchTab: mockSwitchTab,
  }),
}));

import ConfigTab from '../../../src/renderer/components/ConfigTab';

// Mock the list formatter
jest.mock('../../../src/utils/formatters/list-formatter', () => ({
  yamlArrayToPlainText: jest.fn((arr) => (arr || []).join('\n')),
  plainTextToYamlArray: jest.fn((text) => (text ? text.split('\n').filter(Boolean) : [])),
}));

// Mock yaml package

const createBaseConfig = (exportFormat: 'markdown' | 'xml') => ({
  include_extensions: ['.js', '.jsx'],
  use_custom_excludes: true,
  use_gitignore: true,
  use_custom_includes: true,
  enable_secret_scanning: true,
  exclude_suspicious_files: true,
  export_format: exportFormat,
});

const createProviderConfig = (baseConfig: ReturnType<typeof createBaseConfig>) => ({
  ...baseConfig,
  provider: {
    id: 'openai',
    model: 'gpt-4o-mini',
    api_key: 'test-api-key',
    base_url: 'https://api.openai.com/v1',
  },
});

const mockParseYaml = (str: string = '') => {
  if (str.includes('invalid_yaml')) {
    throw new Error('Invalid YAML');
  }

  const exportFormat: 'markdown' | 'xml' = str.includes('export_format: xml') ? 'xml' : 'markdown';
  const includesProvider = str.includes('provider:');

  if (str && str.includes('include_extensions')) {
    const baseConfig = createBaseConfig(exportFormat);
    return includesProvider ? createProviderConfig(baseConfig) : baseConfig;
  }

  if (str && str.includes('export_format')) {
    return {
      export_format: exportFormat,
    };
  }

  return { export_format: 'markdown' };
};

jest.mock('yaml', () => ({
  parse: jest.fn((str = '') => mockParseYaml(str)),
  stringify: jest.fn().mockReturnValue('mocked yaml string'),
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock electronAPI
window.electronAPI = {
  selectDirectory: jest.fn().mockResolvedValue('/mock/directory'),
  testProviderConnection: jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    message: 'Connection successful (200).',
  }),
};

// Mock custom events
window.dispatchEvent = jest.fn();

describe('ConfigTab', () => {
  const mockConfigContent = '# Test configuration\ninclude_extensions:\n  - .js\n  - .jsx';
  const mockOnConfigChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    window.devUtils = {
      clearLocalStorage: jest.fn().mockReturnValue(true),
      isDev: true,
    };
    localStorageMock.getItem.mockReturnValue('/mock/saved/path');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('renders inputs and checkboxes correctly', () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    // Check folder input - reads rootPath from context
    const folderInput = screen.getByPlaceholderText('Select a root folder');
    expect(folderInput).toBeInTheDocument();
    expect(folderInput).toHaveValue('/mock/saved/path');

    // Check checkboxes are rendered
    expect(screen.getByLabelText('Filter by file extensions')).toBeChecked();
    expect(screen.getByLabelText('Use exclude patterns')).toBeChecked();
    expect(screen.getByLabelText('Apply .gitignore rules')).toBeChecked();
    expect(screen.getByLabelText('Scan content for secrets')).toBeChecked();
    expect(screen.getByLabelText('Exclude suspicious files')).toBeChecked();
    expect(screen.getByLabelText('Export format')).toHaveValue('markdown');

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

  test('persists secret scanning toggles in saved config', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const scanSecretsCheckbox = screen.getByLabelText('Scan content for secrets');
    const excludeSuspiciousCheckbox = screen.getByLabelText('Exclude suspicious files');

    act(() => {
      fireEvent.click(scanSecretsCheckbox);
      fireEvent.click(excludeSuspiciousCheckbox);
      jest.advanceTimersByTime(100); // Advance past the debounce
    });

    await waitFor(() => {
      expect(mockOnConfigChange).toHaveBeenCalled();
    });

    const yamlLib = require('yaml');
    expect(yamlLib.stringify).toHaveBeenCalled();
    const savedConfig = yamlLib.stringify.mock.calls.at(-1)[0];

    expect(savedConfig.enable_secret_scanning).toBe(false);
    expect(savedConfig.exclude_suspicious_files).toBe(false);
  });

  test('persists export format changes in saved config', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const exportFormatSelect = screen.getByLabelText('Export format');
    expect(exportFormatSelect).toHaveValue('markdown');

    act(() => {
      fireEvent.change(exportFormatSelect, { target: { value: 'xml' } });
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockOnConfigChange).toHaveBeenCalled();
    });

    const yamlLib = require('yaml');
    expect(yamlLib.stringify).toHaveBeenCalled();
    const savedConfig = yamlLib.stringify.mock.calls.at(-1)[0];
    expect(savedConfig.export_format).toBe('xml');
  });

  test('initializes export format selector to xml when config specifies export_format: xml', () => {
    const xmlConfigContent = `${mockConfigContent}\nexport_format: xml`;
    render(<ConfigTab configContent={xmlConfigContent} onConfigChange={mockOnConfigChange} />);

    expect(screen.getByLabelText('Export format')).toHaveValue('xml');
  });

  test('keeps existing form values when incoming config yaml is invalid', () => {
    const xmlConfigContent = `${mockConfigContent}\nexport_format: xml`;
    const { rerender } = render(
      <ConfigTab configContent={xmlConfigContent} onConfigChange={mockOnConfigChange} />
    );

    expect(screen.getByLabelText('Export format')).toHaveValue('xml');

    rerender(<ConfigTab configContent='invalid_yaml: [' onConfigChange={mockOnConfigChange} />);

    expect(screen.getByLabelText('Export format')).toHaveValue('xml');
  });

  test('calls selectDirectory from context when folder button is clicked', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const selectFolderButton = screen.getByText('Select Folder');

    await act(async () => {
      fireEvent.click(selectFolderButton);
    });

    await waitFor(() => {
      expect(mockSelectDirectory).toHaveBeenCalled();
      expect(mockSwitchTab).toHaveBeenCalledWith('source');
    });
  });

  test('shows provider validation errors but still saves non-provider config', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    // Flush initial auto-save timer and isSaved reset from mount
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    mockOnConfigChange.mockClear();

    const providerSelect = screen.getByLabelText('Provider');

    act(() => {
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
    });

    // Re-query save button after re-render and click it
    const saveButton = screen.getByRole('button', { name: /save config/i });
    act(() => {
      fireEvent.click(saveButton);
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(screen.getByText('Model is required.')).toBeInTheDocument();
      expect(screen.getByText('API key is required for this provider.')).toBeInTheDocument();
      expect(mockOnConfigChange).toHaveBeenCalled();
    });
  });

  test('tests provider connection with actionable request payload', async () => {
    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    const providerSelect = screen.getByLabelText('Provider');
    const modelInput = screen.getByLabelText('Model');
    const apiKeyInput = screen.getByLabelText('API key (optional for Ollama)');
    const testConnectionButton = screen.getByRole('button', { name: 'Test Connection' });

    act(() => {
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      fireEvent.change(modelInput, { target: { value: 'gpt-4o-mini' } });
      fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } });
    });

    await act(async () => {
      fireEvent.click(testConnectionButton);
    });

    await waitFor(() => {
      expect(window.electronAPI.testProviderConnection).toHaveBeenCalledWith({
        providerId: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
        baseUrl: undefined,
      });
      expect(screen.getByText('Connection successful (200).')).toBeInTheDocument();
    });
  });

  test('hides provider setup assistant outside dev mode', () => {
    window.devUtils = {
      clearLocalStorage: jest.fn().mockReturnValue(false),
      isDev: false,
    };

    render(<ConfigTab configContent={mockConfigContent} onConfigChange={mockOnConfigChange} />);

    expect(screen.queryByText('Provider Setup Assistant')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Provider')).not.toBeInTheDocument();
  });

  test('preserves existing provider config when ai surfaces are disabled', async () => {
    window.devUtils = {
      clearLocalStorage: jest.fn().mockReturnValue(false),
      isDev: false,
    };

    const configWithProvider = [
      '# Test configuration',
      'include_extensions:',
      '  - .js',
      '  - .jsx',
      'provider:',
      '  id: openai',
      '  model: gpt-4o-mini',
      '  api_key: test-api-key',
      '  base_url: https://api.openai.com/v1',
    ].join('\n');

    render(<ConfigTab configContent={configWithProvider} onConfigChange={mockOnConfigChange} />);

    const excludePatternCheckbox = screen.getByLabelText('Use exclude patterns');
    act(() => {
      fireEvent.click(excludePatternCheckbox);
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockOnConfigChange).toHaveBeenCalled();
    });

    const yamlLib = require('yaml');
    const savedConfig = yamlLib.stringify.mock.calls.at(-1)[0];

    expect(savedConfig.provider).toEqual(
      expect.objectContaining({
        id: 'openai',
        model: 'gpt-4o-mini',
        api_key: 'test-api-key',
        base_url: 'https://api.openai.com/v1',
      })
    );
  });
});
