import fs from 'fs';
import path from 'path';

import yaml from 'yaml';

import { shouldExclude } from '../../utils/filter-utils';
import { isPathWithinRoot, resolveRealPath } from '../security/path-guard';

import type { ConfigObject, DirectoryTreeItem } from '../../types/ipc';
import type { GitignoreParser } from '../../utils/gitignore-parser';

type FilterPatternBundle = string[] & { includePatterns?: string[]; includeExtensions?: string[] };

type DirectoryTreeServiceOptions = {
  rootPath: string;
  configContent?: string | null;
  gitignoreParser: Pick<GitignoreParser, 'parseGitignore'>;
  onWarn?: (message: string) => void;
  onError?: (message: string, error?: unknown) => void;
};

const appendExcludePatterns = (
  excludePatterns: FilterPatternBundle,
  additionalPatterns: string[] | undefined
): FilterPatternBundle => {
  if (!Array.isArray(additionalPatterns) || additionalPatterns.length === 0) {
    return excludePatterns;
  }

  const mergedPatterns = [...excludePatterns, ...additionalPatterns] as FilterPatternBundle;
  if (Array.isArray(excludePatterns.includePatterns)) {
    mergedPatterns.includePatterns = excludePatterns.includePatterns;
  }
  if (Array.isArray(excludePatterns.includeExtensions)) {
    mergedPatterns.includeExtensions = excludePatterns.includeExtensions;
  }

  return mergedPatterns;
};

const readPathStats = (itemPath: string): { stats: fs.Stats; isSymbolicLink: boolean } => {
  const lstatFn = fs.lstatSync;
  if (typeof lstatFn === 'function') {
    try {
      const lstatResult = lstatFn(itemPath);
      if (lstatResult && typeof lstatResult.isDirectory === 'function') {
        return {
          stats: lstatResult,
          isSymbolicLink:
            typeof lstatResult.isSymbolicLink === 'function' && lstatResult.isSymbolicLink(),
        };
      }
    } catch {
      // Fall back to statSync when lstatSync fails (e.g., transient ENOENT in mocked/fs race scenarios).
    }
  }

  return {
    stats: fs.statSync(itemPath),
    isSymbolicLink: false,
  };
};

const parseFilterSettings = (
  rootPath: string,
  configContent: string | null | undefined,
  gitignoreParser: Pick<GitignoreParser, 'parseGitignore'>,
  onError: (message: string, error?: unknown) => void
): { excludePatterns: FilterPatternBundle; config: ConfigObject } => {
  let excludePatterns: FilterPatternBundle = [];
  let config: ConfigObject;

  try {
    config = (configContent
      ? (yaml.parse(configContent) as ConfigObject)
      : ({ exclude_patterns: [] } as ConfigObject)) || { exclude_patterns: [] };

    const useCustomExcludes = config.use_custom_excludes !== false;
    const useCustomIncludes = config.use_custom_includes !== false;
    const useGitignore = config.use_gitignore !== false;

    if (useCustomExcludes && Array.isArray(config.exclude_patterns)) {
      excludePatterns = appendExcludePatterns(excludePatterns, config.exclude_patterns);
    }

    if (useCustomIncludes && config.include_extensions && Array.isArray(config.include_extensions)) {
      excludePatterns.includeExtensions = config.include_extensions;
    }

    if (useGitignore) {
      const gitignoreResult = gitignoreParser.parseGitignore(rootPath);
      excludePatterns = appendExcludePatterns(excludePatterns, gitignoreResult.excludePatterns);
      if (gitignoreResult.includePatterns && gitignoreResult.includePatterns.length > 0) {
        excludePatterns.includePatterns = gitignoreResult.includePatterns;
      }
    }
  } catch (error) {
    onError('Error parsing config:', error);
    excludePatterns = ['**/.git/**'];
    config = { exclude_patterns: [] };
  }

  return { excludePatterns, config };
};

const sortTreeItems = (a: DirectoryTreeItem, b: DirectoryTreeItem): number => {
  if (a.type === 'directory' && b.type === 'file') return -1;
  if (a.type === 'file' && b.type === 'directory') return 1;
  return a.name.localeCompare(b.name);
};

export const getDirectoryTree = ({
  rootPath,
  configContent,
  gitignoreParser,
  onWarn = console.warn,
  onError = console.error,
}: DirectoryTreeServiceOptions): DirectoryTreeItem[] => {
  const { excludePatterns, config } = parseFilterSettings(
    rootPath,
    configContent,
    gitignoreParser,
    onError
  );
  const localShouldExclude = (itemPath: string) => {
    return shouldExclude(itemPath, rootPath, excludePatterns, config);
  };

  const visitedDirectoryRealPaths = new Set<string>();

  const processEntry = (
    dir: string,
    item: string,
    walkFn: (nextDirectoryPath: string) => DirectoryTreeItem[]
  ): DirectoryTreeItem | null => {
    const itemPath = path.join(dir, item);
    if (localShouldExclude(itemPath)) {
      return null;
    }

    const { stats, isSymbolicLink } = readPathStats(itemPath);
    if (isSymbolicLink) {
      const resolvedSymlinkPath = resolveRealPath(itemPath);
      if (!isPathWithinRoot(rootPath, resolvedSymlinkPath)) {
        onWarn(`Skipping symlink outside current root directory: ${itemPath}`);
      }
      // Intentionally skip all symlinks (including in-root targets) to avoid
      // implicit path aliasing in tree output and keep traversal boundaries explicit.
      return null;
    }

    if (!isPathWithinRoot(rootPath, itemPath)) {
      onWarn(`Skipping path outside current root directory: ${itemPath}`);
      return null;
    }

    if (stats.isDirectory()) {
      const children = walkFn(itemPath);
      if (children.length === 0) {
        return null;
      }

      return {
        name: item,
        path: itemPath,
        type: 'directory',
        size: stats.size,
        lastModified: stats.mtime,
        children,
        itemCount: children.length,
      };
    }

    return {
      name: item,
      path: itemPath,
      type: 'file',
      size: stats.size,
      lastModified: stats.mtime,
      extension: path.extname(item).toLowerCase(),
    };
  };

  const walkDirectory = (directoryPath: string): DirectoryTreeItem[] => {
    const realDirectoryPath = resolveRealPath(directoryPath);
    if (visitedDirectoryRealPaths.has(realDirectoryPath)) {
      onWarn(`Skipping previously visited directory to avoid recursion loops: ${directoryPath}`);
      return [];
    }
    visitedDirectoryRealPaths.add(realDirectoryPath);

    const items = fs.readdirSync(directoryPath);
    const result: DirectoryTreeItem[] = [];

    for (const item of items) {
      try {
        const entry = processEntry(directoryPath, item, walkDirectory);
        if (entry) {
          result.push(entry);
        }
      } catch (error) {
        onError(`Error processing ${path.join(directoryPath, item)}:`, error);
      }
    }

    return result.sort(sortTreeItems);
  };

  try {
    return walkDirectory(rootPath);
  } catch (error) {
    onError('Error getting directory tree:', error);
    return [];
  }
};
