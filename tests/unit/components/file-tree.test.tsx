import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FileTree from '../../../src/renderer/components/FileTree';

// Mock data for testing
const mockItems = [
  {
    name: 'src',
    path: '/project/src',
    type: 'directory',
    children: [
      {
        name: 'index.js',
        path: '/project/src/index.js',
        type: 'file',
      },
      {
        name: 'utils',
        path: '/project/src/utils',
        type: 'directory',
        children: [
          {
            name: 'helpers.js',
            path: '/project/src/utils/helpers.js',
            type: 'file',
          },
        ],
      },
    ],
  },
  {
    name: 'package.json',
    path: '/project/package.json',
    type: 'file',
  },
];

describe('FileTree Component', () => {
  const mockFileSelect = jest.fn();
  const mockFolderSelect = jest.fn();
  const mockBatchSelect = jest.fn();

  beforeEach(() => {
    mockFileSelect.mockClear();
    mockFolderSelect.mockClear();
    mockBatchSelect.mockClear();
  });

  test('renders the file tree correctly', () => {
    render(
      <FileTree
        items={mockItems}
        selectedFiles={new Set()}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // Check if folders are rendered - use more specific role-based queries
    expect(screen.getByRole('button', { name: /expand folder src/i })).toBeInTheDocument();
    // For files, the row is now a treeitem div
    expect(screen.getByRole('treeitem', { name: /package\.json/i })).toBeInTheDocument();
  });

  test('displays correct count of selected files', () => {
    const selectedFiles = new Set(['/project/src/index.js', '/project/package.json']);

    render(
      <FileTree
        items={mockItems}
        selectedFiles={selectedFiles}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // Check if the count is displayed correctly - use more specific query
    const countDisplay = screen.getByText(/files selected/i);
    expect(countDisplay).toHaveTextContent('2 of 3 files selected');
  });

  test('selects individual files when clicked', () => {
    render(
      <FileTree
        items={mockItems}
        selectedFiles={new Set()}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // Find and click on package.json treeitem row
    const packageJsonRow = screen.getByRole('treeitem', { name: /package\.json/i });
    fireEvent.click(packageJsonRow);

    // Verify that onFileSelect was called with the correct path and selected state
    expect(mockFileSelect).toHaveBeenCalledWith('/project/package.json', true);
  });

  test('toggles folder expansion when folder is clicked', () => {
    render(
      <FileTree
        items={mockItems}
        selectedFiles={new Set()}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // First check that the helpers.js element is not visible initially
    const helpersElement = screen.queryByRole('treeitem', { name: /helpers\.js/i });
    if (helpersElement) {
      expect(helpersElement).not.toBeVisible();
    } else {
      expect(helpersElement).toBeNull();
    }

    // Find and click on the src folder expand button
    const srcExpandButton = screen.getByRole('button', { name: /expand folder src/i });
    expect(srcExpandButton).toBeInTheDocument();
    fireEvent.click(srcExpandButton);

    // Now utils folder should be visible
    const utilsExpandButton = screen.getByRole('button', { name: /expand folder utils/i });
    expect(utilsExpandButton).toBeInTheDocument();
    expect(utilsExpandButton).toBeVisible();

    // Click to expand utils folder
    fireEvent.click(utilsExpandButton);

    // After expanding utils, verify helpers.js is accessible and visible
    const helpersRow = screen.getByRole('treeitem', { name: /helpers\.js/i });
    expect(helpersRow).toBeInTheDocument();
    expect(helpersRow).toBeVisible();
  });

  test('selects all files when "Select All" is clicked (per-item fallback)', () => {
    render(
      <FileTree
        items={mockItems}
        selectedFiles={new Set()}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // Find and click the "Select All" checkbox
    const selectAllCheckbox = screen.getByLabelText('Select All');
    fireEvent.click(selectAllCheckbox);

    // Without onBatchSelect, falls back to per-item calls
    expect(mockFileSelect).toHaveBeenCalledWith('/project/src/index.js', true);
    expect(mockFileSelect).toHaveBeenCalledWith('/project/src/utils/helpers.js', true);
    expect(mockFileSelect).toHaveBeenCalledWith('/project/package.json', true);

    expect(mockFolderSelect).toHaveBeenCalledWith('/project/src', true);
    expect(mockFolderSelect).toHaveBeenCalledWith('/project/src/utils', true);
  });

  test('selects all files via batch handler when provided', () => {
    render(
      <FileTree
        items={mockItems}
        selectedFiles={new Set()}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
        onBatchSelect={mockBatchSelect}
      />
    );

    const selectAllCheckbox = screen.getByLabelText('Select All');
    fireEvent.click(selectAllCheckbox);

    // With onBatchSelect, a single batch call replaces per-item calls
    expect(mockBatchSelect).toHaveBeenCalledWith(
      ['/project/src/index.js', '/project/src/utils/helpers.js', '/project/package.json'],
      ['/project/src', '/project/src/utils'],
      true
    );
    expect(mockFileSelect).not.toHaveBeenCalled();
    expect(mockFolderSelect).not.toHaveBeenCalled();
  });

  test('deselects all files when "Select All" is toggled off', () => {
    render(
      <FileTree
        items={mockItems}
        selectedFiles={
          new Set([
            '/project/src/index.js',
            '/project/package.json',
            '/project/src/utils/helpers.js',
          ])
        }
        selectedFolders={new Set(['/project/src', '/project/src/utils'])}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // Find and click the "Select All" checkbox (which should be checked)
    const selectAllCheckbox = screen.getByLabelText('Select All');
    expect(selectAllCheckbox).toBeChecked();

    fireEvent.click(selectAllCheckbox);

    // Verify that onFileSelect was called to deselect all files
    expect(mockFileSelect).toHaveBeenCalledWith('/project/src/index.js', false);
    expect(mockFileSelect).toHaveBeenCalledWith('/project/src/utils/helpers.js', false);
    expect(mockFileSelect).toHaveBeenCalledWith('/project/package.json', false);

    // Verify that onFolderSelect was called to deselect all folders
    expect(mockFolderSelect).toHaveBeenCalledWith('/project/src', false);
    expect(mockFolderSelect).toHaveBeenCalledWith('/project/src/utils', false);
  });

  test('shows empty state when no items are provided', () => {
    render(
      <FileTree
        items={[]}
        selectedFiles={new Set()}
        selectedFolders={new Set()}
        onFileSelect={mockFileSelect}
        onFolderSelect={mockFolderSelect}
      />
    );

    // Check if empty state message is shown
    expect(screen.getByText('No files to display')).toBeInTheDocument();
    expect(screen.getByText('Select a directory to view files')).toBeInTheDocument();
  });
});
