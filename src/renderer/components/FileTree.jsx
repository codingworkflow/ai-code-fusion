import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// Define item prop shape for reuse
const ItemPropType = PropTypes.shape({
  name: PropTypes.string.isRequired,
  path: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  children: PropTypes.array,
});

// Create the FileTreeItem component
const FileTreeItemComponent = (props) => {
  const {
    item,
    level = 0,
    selectedFiles,
    selectedFolders = [],
    onFileSelect,
    onFolderSelect,
  } = props;

  // Calculate initial selection state based on props
  const isFile = item.type === 'file';
  const isFolder = item.type === 'directory';

  // Set initial state directly from props
  const initialSelected = isFile
    ? selectedFiles.includes(item.path)
    : isFolder && selectedFolders
      ? selectedFolders.includes(item.path)
      : false;

  const [isOpen, setIsOpen] = useState(false);
  const [isSelected, setIsSelected] = useState(initialSelected);

  // Keep selection state in sync with props
  useEffect(() => {
    const shouldBeSelected = isFile
      ? selectedFiles.includes(item.path)
      : isFolder && selectedFolders
        ? selectedFolders.includes(item.path)
        : false;

    // Only update if needed
    if (isSelected !== shouldBeSelected) {
      setIsSelected(shouldBeSelected);
    }
  }, [selectedFiles, selectedFolders, item.path, isFile, isFolder, isSelected]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    const newIsSelected = !isSelected;
    setIsSelected(newIsSelected);

    if (isFile) {
      onFileSelect(item.path, newIsSelected);
    } else if (isFolder) {
      onFolderSelect(item.path, newIsSelected);
    }
  };

  const handleCheckboxChange = (e) => {
    e.stopPropagation();
    const newIsSelected = e.target.checked;
    setIsSelected(newIsSelected);

    if (isFile) {
      onFileSelect(item.path, newIsSelected);
    } else if (isFolder) {
      onFolderSelect(item.path, newIsSelected);
    }
  };

  const handleNameClick = (e) => {
    if (isFolder) {
      e.stopPropagation();
      setIsOpen(!isOpen);
    }
  };

  // Calculate proper padding for different levels
  const paddingLeft = level * 16; // 16px per level

  // For a smoother UI experience, derive checkbox state directly from props each render
  const checkboxIsSelected = isFile
    ? selectedFiles.includes(item.path)
    : isFolder && selectedFolders
      ? selectedFolders.includes(item.path)
      : false;

  return (
    <div className='my-1'>
      <div
        className={`flex cursor-pointer items-center py-1 hover:bg-gray-100 ${
          checkboxIsSelected ? 'bg-blue-100' : ''
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleSelect}
      >
        <div className='mr-2 shrink-0'>
          <input
            type='checkbox'
            id={`checkbox-${item.path}`}
            // Use the directly derived prop value instead of local state
            checked={checkboxIsSelected}
            onChange={handleCheckboxChange}
            className='size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500'
          />
        </div>

        {isFolder && (
          <button
            className='mr-1 size-5 shrink-0 rounded text-gray-500 hover:bg-gray-200 focus:outline-none'
            onClick={handleToggle}
            aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
          >
            <span className='block text-center'>{isOpen ? '▼' : '▶'}</span>
          </button>
        )}

        <label
          htmlFor={`checkbox-${item.path}`}
          className='flex grow cursor-pointer items-center overflow-hidden'
          onClick={isFolder ? handleNameClick : undefined}
        >
          {isFile ? (
            <span className='mr-1 shrink-0 text-gray-500'>📄</span>
          ) : (
            <span className='mr-1 shrink-0 cursor-pointer text-yellow-500' onClick={handleToggle}>
              {isOpen ? '📂' : '📁'}
            </span>
          )}
          <span
            className={`truncate ${isFolder ? 'font-semibold hover:underline' : ''}`}
            title={item.path} // Show full path on hover for better context
          >
            {item.name}
          </span>
        </label>
      </div>

      {isFolder && item.children && (
        <div
          className={`overflow-hidden transition-all duration-200 ${
            isOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {item.children.map((child) => (
            <FileTreeItem
              key={child.path}
              item={child}
              level={level + 1}
              selectedFiles={selectedFiles}
              selectedFolders={selectedFolders}
              onFileSelect={onFileSelect}
              onFolderSelect={onFolderSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Define prop types for FileTreeItemComponent
FileTreeItemComponent.propTypes = {
  item: ItemPropType.isRequired,
  level: PropTypes.number,
  selectedFiles: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedFolders: PropTypes.arrayOf(PropTypes.string),
  onFileSelect: PropTypes.func.isRequired,
  onFolderSelect: PropTypes.func.isRequired,
};

// Default props are handled via destructuring defaults in the function parameters

// Memoize the component and set display name
const FileTreeItem = React.memo(FileTreeItemComponent);
FileTreeItem.displayName = 'FileTreeItem';

// Create the FileTree component
const FileTreeComponent = (props) => {
  const { items = [], selectedFiles, selectedFolders = [], onFileSelect, onFolderSelect } = props;

  // Function to select/deselect all files
  const totalFiles = React.useMemo(() => {
    const countTotalFiles = (itemsToCount) => {
      if (!itemsToCount || itemsToCount.length === 0) return 0;

      let count = 0;
      for (const item of itemsToCount) {
        if (item.type === 'file') {
          count++;
        } else if (item.type === 'directory' && item.children) {
          count += countTotalFiles(item.children);
        }
      }
      return count;
    };

    return countTotalFiles(items);
  }, [items]);

  // Determine if all files are selected - now with additional check for empty tree
  const selectAllChecked = React.useMemo(() => {
    if (totalFiles === 0) return false;

    // If we have selected files but the count doesn't match, we may need to verify
    // that the selected files are actually in the current tree
    if (selectedFiles.length > 0 && selectedFiles.length !== totalFiles) {
      // Count how many of the selected files are actually in the current tree
      const validFilePaths = new Set();

      // Function to collect all valid file paths in the tree
      const collectFilePaths = (itemsToSearch) => {
        itemsToSearch.forEach((item) => {
          if (item.type === 'file') {
            validFilePaths.add(item.path);
          } else if (item.type === 'directory' && item.children) {
            collectFilePaths(item.children);
          }
        });
      };

      // Build our set of valid file paths
      collectFilePaths(items);

      // Count only selected files that exist in the current tree
      const validSelectedFilesCount = selectedFiles.filter((path) =>
        validFilePaths.has(path)
      ).length;

      // If all files in the tree are selected, return true
      if (validSelectedFilesCount === totalFiles) {
        return true;
      }
    }

    // Standard check
    return selectedFiles.length === totalFiles;
  }, [selectedFiles, totalFiles, items]);

  // Handle select all toggle
  const handleSelectAllToggle = () => {
    // Get all file and folder paths
    const getAllPaths = (itemsToProcess) => {
      if (!itemsToProcess || itemsToProcess.length === 0) return { files: [], folders: [] };

      let result = { files: [], folders: [] };

      for (const item of itemsToProcess) {
        if (item.type === 'file') {
          result.files.push(item.path);
        } else if (item.type === 'directory') {
          result.folders.push(item.path);
          const subPaths = getAllPaths(item.children);
          result.files = [...result.files, ...subPaths.files];
          result.folders = [...result.folders, ...subPaths.folders];
        }
      }
      return result;
    };

    const allPaths = getAllPaths(items);

    if (selectAllChecked) {
      // Deselect all files
      allPaths.files.forEach((path) => onFileSelect(path, false));
      allPaths.folders.forEach((path) => onFolderSelect(path, false));
    } else {
      // Select all files
      allPaths.files.forEach((path) => onFileSelect(path, true));
      allPaths.folders.forEach((path) => onFolderSelect(path, true));
    }
  };

  return (
    <div className='file-tree rounded-md border border-gray-200'>
      <div className='flex items-center justify-between border-b border-gray-200 bg-gray-50 p-2'>
        <div className='flex items-center'>
          <input
            type='checkbox'
            checked={selectAllChecked}
            onChange={handleSelectAllToggle}
            disabled={!items || items.length === 0}
            className={`mr-2 size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
              !items || items.length === 0 ? 'cursor-not-allowed opacity-50' : ''
            }`}
            id='select-all-checkbox'
          />
          <label
            htmlFor='select-all-checkbox'
            className='cursor-pointer select-none text-sm font-medium text-gray-700'
          >
            Select All
          </label>
        </div>
        <span className='text-xs font-medium text-gray-500'>
          {/* Display file count and total files */}
          <span className='font-medium'>{selectedFiles.length}</span> of {totalFiles} files selected
        </span>
      </div>

      <div className='max-h-96 overflow-auto p-2'>
        {!items || items.length === 0 ? (
          <div className='flex flex-col items-center justify-center p-8 text-center text-gray-500'>
            <svg
              className='mb-4 size-12 text-gray-400'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              xmlns='http://www.w3.org/2000/svg'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z'
              ></path>
            </svg>
            <p>No files to display</p>
            <p className='mt-2 text-sm'>Select a directory to view files</p>
          </div>
        ) : (
          items.map((item) => (
            <FileTreeItem
              key={item.path}
              item={item}
              level={0}
              selectedFiles={selectedFiles}
              selectedFolders={selectedFolders}
              onFileSelect={onFileSelect}
              onFolderSelect={onFolderSelect}
            />
          ))
        )}
      </div>
    </div>
  );
};

// Define prop types for FileTreeComponent
FileTreeComponent.propTypes = {
  items: PropTypes.arrayOf(ItemPropType),
  selectedFiles: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedFolders: PropTypes.arrayOf(PropTypes.string),
  onFileSelect: PropTypes.func.isRequired,
  onFolderSelect: PropTypes.func.isRequired,
};

// Default props are handled via destructuring defaults in the function parameters

// Memoize the component and set display name
const FileTree = React.memo(FileTreeComponent);
FileTree.displayName = 'FileTree';

export default FileTree;
