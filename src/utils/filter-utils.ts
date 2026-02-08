import path from 'path';
import fnmatch from './fnmatch';
import type { ConfigObject } from '../types/ipc';
import { isSensitiveFilePath, shouldExcludeSuspiciousFiles } from './secret-scanner';

type ExcludePatterns = string[] & { includePatterns?: string[]; includeExtensions?: string[] };

export const normalizePath = (inputPath: string): string => inputPath.replace(/\\/g, '/');

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
  excludePatterns.length > 0 &&
  excludePatterns.some(
    (pattern) =>
      fnmatch.fnmatch(normalizedPath, pattern) ||
      (!pattern.includes('/') && fnmatch.fnmatch(itemName, pattern))
  );

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

    if (shouldExcludeSuspiciousFiles(config) && isSensitiveFilePath(itemPath)) {
      return true;
    }

    if (shouldExcludeByExtension(itemPath, config)) {
      return true;
    }

    if (customExcludes.length > 0 && matchesExcludePatterns(normalizedPath, itemName, customExcludes)) {
      return true;
    }

    if (config?.use_gitignore !== false) {
      const gitignoreIncludes = excludePatterns?.includePatterns || [];
      if (
        gitignoreIncludes.length > 0 &&
        matchesIncludePatterns(normalizedPath, itemName, gitignoreIncludes)
      ) {
        return false;
      }

      const gitignoreExcludes = Array.isArray(excludePatterns)
        ? excludePatterns.filter((pattern) => !customExcludes.includes(pattern))
        : [];

      if (
        gitignoreExcludes.length > 0 &&
        matchesExcludePatterns(normalizedPath, itemName, gitignoreExcludes)
      ) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error in shouldExclude for ${itemPath}:`, error);
    return false;
  }
};
