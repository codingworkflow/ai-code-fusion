import path from 'path';

import fnmatch from './fnmatch';
import { shouldExcludeSensitiveFilePath } from './secret-scanner';

import type { ConfigObject } from '../types/ipc';

type ExcludePatterns = string[] & { includePatterns?: string[]; includeExtensions?: string[] };

export const normalizePath = (inputPath: string): string => inputPath.replaceAll('\\', '/');

export const getRelativePath = (filePath: string, rootPath: string): string =>
  normalizePath(path.relative(rootPath, filePath));

const shouldExcludeByExtension = (itemPath: string, config?: ConfigObject): boolean => {
  const useCustomIncludes = config?.use_custom_includes !== false;

  if (
    useCustomIncludes &&
    config?.include_extensions &&
    Array.isArray(config.include_extensions) &&
    config.include_extensions.length > 0 &&
    path.extname(itemPath)
  ) {
    const ext = path.extname(itemPath).toLowerCase();
    const includeExtensions = config.include_extensions.map((includeExt) => includeExt.toLowerCase());
    return !includeExtensions.includes(ext);
  }

  return false;
};

const matchesIncludePatterns = (
  normalizedPath: string,
  itemName: string,
  includePatterns: string[]
): boolean => {
  if (!Array.isArray(includePatterns) || includePatterns.length === 0) {
    return false;
  }

  for (const pattern of includePatterns) {
    if (
      fnmatch.fnmatch(normalizedPath, pattern) ||
      (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
    ) {
      return true;
    }
  }

  return false;
};

const matchesExcludePatterns = (
  normalizedPath: string,
  itemName: string,
  excludePatterns: string[]
): boolean =>
  Array.isArray(excludePatterns) &&
  excludePatterns.some(
    (pattern) =>
      fnmatch.fnmatch(normalizedPath, pattern) ||
      (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
  );

const shouldExcludeByCustomPatterns = (
  normalizedPath: string,
  itemName: string,
  customExcludes: string[]
): boolean =>
  customExcludes.length > 0 && matchesExcludePatterns(normalizedPath, itemName, customExcludes);

const shouldExcludeByGitignorePatterns = (
  normalizedPath: string,
  itemName: string,
  excludePatterns: ExcludePatterns | undefined,
  customExcludes: string[],
  config?: ConfigObject
): boolean => {
  if (config?.use_gitignore === false) {
    return false;
  }

  const gitignoreIncludes = excludePatterns?.includePatterns || [];
  if (gitignoreIncludes.length > 0 && matchesIncludePatterns(normalizedPath, itemName, gitignoreIncludes)) {
    return false;
  }

  const gitignoreExcludes = Array.isArray(excludePatterns)
    ? excludePatterns.filter((pattern) => !customExcludes.includes(pattern))
    : [];

  return gitignoreExcludes.length > 0 && matchesExcludePatterns(normalizedPath, itemName, gitignoreExcludes);
};

export const shouldExclude = (
  itemPath: string,
  rootPath: string,
  excludePatterns?: ExcludePatterns,
  config?: ConfigObject
): boolean => {
  try {
    const itemName = path.basename(itemPath);
    const normalizedPath = getRelativePath(itemPath, rootPath);
    const useCustomExcludes = config?.use_custom_excludes !== false;
    const customExcludes =
      useCustomExcludes && Array.isArray(config?.exclude_patterns) ? config.exclude_patterns : [];

    if (shouldExcludeSensitiveFilePath(itemPath, config)) {
      return true;
    }

    if (shouldExcludeByExtension(itemPath, config)) {
      return true;
    }

    if (shouldExcludeByCustomPatterns(normalizedPath, itemName, customExcludes)) {
      return true;
    }

    return shouldExcludeByGitignorePatterns(
      normalizedPath,
      itemName,
      excludePatterns,
      customExcludes,
      config
    );
  } catch (error) {
    console.error(`Error in shouldExclude for ${itemPath}:`, error);
    return false;
  }
};
