import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DirectoryTreeItem, SelectionHandler } from '../../types/ipc';

type FileTreeItemProps = {
  item: DirectoryTreeItem;
  level?: number;
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  onFileSelect: SelectionHandler;
  onFolderSelect: SelectionHandler;
};

type FileTreeProps = {
  items?: DirectoryTreeItem[];
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  onFileSelect: SelectionHandler;
  onFolderSelect: SelectionHandler;
  onBatchSelect?: (files: string[], folders: string[], isSelected: boolean) => void;
};

const getSelectionStatus = (
  item: DirectoryTreeItem,
  selectedFiles: Set<string>,
  selectedFolders: Set<string>
): boolean => {
  if (item.type === 'file') {
    return selectedFiles.has(item.path);
  }

  return selectedFolders.has(item.path);
};

const FileTreeItemComponent = ({
  item,
  level = 0,
  selectedFiles,
  selectedFolders,
  onFileSelect,
  onFolderSelect,
}: FileTreeItemProps) => {
  const { t } = useTranslation();
  const isFile = item.type === 'file';
  const isFolder = item.type === 'directory';
  const checkboxIsSelected = getSelectionStatus(item, selectedFiles, selectedFolders);
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
    const newIsSelected = !checkboxIsSelected;

    if (isFile) {
      onFileSelect(item.path, newIsSelected);
      return;
    }

    if (isFolder) {
      onFolderSelect(item.path, newIsSelected);
    }
  };

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const newIsSelected = event.target.checked;

    if (isFile) {
      onFileSelect(item.path, newIsSelected);
      return;
    }

    if (isFolder) {
      onFolderSelect(item.path, newIsSelected);
    }
  };

  const paddingLeft = level * 16;

  return (
    <div className='my-1'>
      <div
        role='treeitem'
        tabIndex={0}
        className={`flex items-center py-1 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left cursor-pointer ${
          checkboxIsSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelect(event);
          }
        }}
        aria-selected={checkboxIsSelected}
      >
        <div className='mr-2 shrink-0'>
          <input
            type='checkbox'
            id={`checkbox-${item.path}`}
            checked={checkboxIsSelected}
            onChange={handleCheckboxChange}
            onClick={(event) => event.stopPropagation()}
            aria-labelledby={`label-${item.path}`}
            className='size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500'
          />
        </div>

        {isFolder && (
          <button
            type='button'
            className='mr-1 size-5 shrink-0 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none'
            onClick={handleToggle}
            aria-label={isOpen ? t('fileTree.collapseFolder') : t('fileTree.expandFolder')}
          >
            <span className='block text-center'>{isOpen ? '▼' : '▶'}</span>
          </button>
        )}

        <div className='flex grow items-center overflow-hidden'>
          {isFile ? (
            <>
              <span className='mr-1 shrink-0 text-gray-500 dark:text-gray-400' aria-hidden='true'>
                📄
              </span>
              <span id={`label-${item.path}`} className='truncate' title={item.path}>
                {item.name}
              </span>
              <label htmlFor={`checkbox-${item.path}`} className='sr-only'>
                {item.name}
              </label>
            </>
          ) : (
            <>
              <button
                type='button'
                className='mr-1 flex items-center text-left border-0 bg-transparent p-0 cursor-pointer'
                onClick={handleToggle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    handleToggle(event);
                  }
                }}
                aria-expanded={isOpen}
                aria-label={
                  isOpen
                    ? t('fileTree.collapseFolderWithName', { name: item.name })
                    : t('fileTree.expandFolderWithName', { name: item.name })
                }
              >
                <span className='shrink-0 text-yellow-500' aria-hidden='true'>
                  {isOpen ? '📂' : '📁'}
                </span>
                <span
                  id={`label-${item.path}`}
                  className='ml-1 truncate font-semibold hover:underline'
                  title={item.path}
                >
                  {item.name}
                </span>
              </button>
              <label htmlFor={`checkbox-${item.path}`} className='sr-only'>
                {item.name}
              </label>
            </>
          )}
        </div>
      </div>

      {isFolder && isOpen && item.children && (
        <div className='overflow-hidden transition-all duration-200 max-h-screen opacity-100'>
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

const FileTreeItem = React.memo(FileTreeItemComponent);
FileTreeItem.displayName = 'FileTreeItem';

const countTotalFiles = (itemsToCount: DirectoryTreeItem[]): number => {
  let count = 0;

  for (const item of itemsToCount) {
    if (item.type === 'file') {
      count += 1;
    } else if (item.children) {
      count += countTotalFiles(item.children);
    }
  }

  return count;
};

const collectFilePaths = (itemsToSearch: DirectoryTreeItem[], target: Set<string>) => {
  for (const item of itemsToSearch) {
    if (item.type === 'file') {
      target.add(item.path);
    } else if (item.children) {
      collectFilePaths(item.children, target);
    }
  }
};

const getAllPaths = (itemsToProcess: DirectoryTreeItem[]): { files: string[]; folders: string[] } => {
  const result = { files: [] as string[], folders: [] as string[] };

  for (const item of itemsToProcess) {
    if (item.type === 'file') {
      result.files.push(item.path);
      continue;
    }

    result.folders.push(item.path);
    if (item.children) {
      const subPaths = getAllPaths(item.children);
      result.files.push(...subPaths.files);
      result.folders.push(...subPaths.folders);
    }
  }

  return result;
};

const FileTreeComponent = ({
  items = [],
  selectedFiles,
  selectedFolders,
  onFileSelect,
  onFolderSelect,
  onBatchSelect,
}: FileTreeProps) => {
  const { t } = useTranslation();
  const totalFiles = useMemo(() => countTotalFiles(items), [items]);

  const selectAllChecked = useMemo(() => {
    if (totalFiles === 0) return false;

    const validFilePaths = new Set<string>();
    collectFilePaths(items, validFilePaths);
    for (const filePath of validFilePaths) {
      if (!selectedFiles.has(filePath)) return false;
    }
    return true;
  }, [items, selectedFiles, totalFiles]);

  const handleSelectAllToggle = () => {
    const allPaths = getAllPaths(items);

    if (onBatchSelect) {
      onBatchSelect(allPaths.files, allPaths.folders, !selectAllChecked);
      return;
    }

    if (selectAllChecked) {
      allPaths.files.forEach((filePath) => onFileSelect(filePath, false));
      allPaths.folders.forEach((folderPath) => onFolderSelect(folderPath, false));
      return;
    }

    allPaths.files.forEach((filePath) => onFileSelect(filePath, true));
    allPaths.folders.forEach((folderPath) => onFolderSelect(folderPath, true));
  };

  return (
    <div className='file-tree flex min-h-0 flex-1 flex-col rounded-md border border-gray-200 dark:border-gray-700'>
      <div className='flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2'>
        <div className='flex items-center'>
          <input
            type='checkbox'
            checked={selectAllChecked}
            onChange={handleSelectAllToggle}
            disabled={items.length === 0}
            className={`mr-2 size-4 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
              items.length === 0 ? 'cursor-not-allowed opacity-50' : ''
            }`}
            id='select-all-checkbox'
          />
          <label
            htmlFor='select-all-checkbox'
            className='cursor-pointer select-none text-sm font-medium text-gray-700 dark:text-gray-300'
          >
            {t('fileTree.selectAll')}
          </label>
        </div>
        <span className='text-xs font-medium text-gray-500 dark:text-gray-400'>
          {t('fileTree.selectedCount', { selected: selectedFiles.size, total: totalFiles })}
        </span>
      </div>

      <div role='tree' className='flex-1 min-h-0 overflow-auto p-2'>
        {items.length === 0 ? (
          <div className='flex flex-col items-center justify-center p-8 text-center text-gray-500 dark:text-gray-400'>
            <svg
              className='mb-4 size-12 text-gray-400 dark:text-gray-500'
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
            <p>{t('fileTree.emptyTitle')}</p>
            <p className='mt-2 text-sm'>{t('fileTree.emptyHint')}</p>
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

const FileTree = React.memo(FileTreeComponent);
FileTree.displayName = 'FileTree';

export default FileTree;
