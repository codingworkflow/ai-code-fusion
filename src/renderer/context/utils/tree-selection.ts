import { isPathWithinRootBoundary } from './path-boundary';

import type { DirectoryTreeItem } from '../../../types/ipc';

export const findFolderByPath = (
  items: DirectoryTreeItem[] | undefined,
  targetPath: string
): DirectoryTreeItem | null => {
  for (const item of items ?? []) {
    if (item.path === targetPath) {
      return item;
    }

    if (item.type === 'directory' && item.children) {
      const found = findFolderByPath(item.children, targetPath);
      if (found) {
        return found;
      }
    }
  }

  return null;
};

export const collectSubFoldersWithinBoundary = (
  folder: DirectoryTreeItem,
  rootPath: string
): string[] => {
  if (!folder.children) {
    return [];
  }

  let folders: string[] = [];

  for (const item of folder.children ?? []) {
    if (item.type === 'directory' && isPathWithinRootBoundary(item.path, rootPath)) {
      folders.push(item.path, ...collectSubFoldersWithinBoundary(item, rootPath));
    }
  }

  return folders;
};

export const collectFilesWithinBoundary = (
  folder: DirectoryTreeItem,
  rootPath: string
): string[] => {
  if (!folder.children) {
    return [];
  }

  let files: string[] = [];

  for (const item of folder.children ?? []) {
    if (item.type === 'file') {
      if (isPathWithinRootBoundary(item.path, rootPath)) {
        files.push(item.path);
      }
    } else if (item.type === 'directory') {
      files = [...files, ...collectFilesWithinBoundary(item, rootPath)];
    }
  }

  return files;
};
