import fs from 'fs';
import path from 'path';

import { ContentProcessor } from '../../utils/content-processor';
import {
  normalizeExportFormat,
  normalizeTokenCount,
  toXmlNumericAttribute,
  wrapXmlCdata,
} from '../../utils/export-format';
import { TokenCounter } from '../../utils/token-counter';
import { getErrorMessage } from '../errors';
import { isPathWithinRoot } from '../security/path-guard';

import type { FileInfo, ProcessRepositoryOptions, ProcessRepositoryResult } from '../../types/ipc';

type RepositoryProcessingOptions = {
  showTokenCount: boolean;
  includeTreeView: boolean;
  exportFormat: ReturnType<typeof normalizeExportFormat>;
};

type ProcessedRepositoryFileResult = {
  content: string;
  tokenCount: number;
} | null;

type ProcessRepositoryInput = {
  rootPath: string;
  filesInfo: FileInfo[] | undefined;
  treeView?: string | null;
  options?: ProcessRepositoryOptions['options'];
  onWarn?: (message: string) => void;
  onInfo?: (message: string, metadata?: unknown) => void;
};

interface PathTree {
  [key: string]: PathTree | null;
}

const createPathTreeNode = (): PathTree => {
  return Object.create(null) as PathTree;
};

const resolveRepositoryProcessingOptions = (
  options: ProcessRepositoryOptions['options'] = {}
): RepositoryProcessingOptions => ({
  showTokenCount: options.showTokenCount !== false,
  includeTreeView: options.includeTreeView === true,
  exportFormat: normalizeExportFormat(options.exportFormat),
});

const upsertPathPart = (tree: PathTree, part: string, isLeaf: boolean): PathTree | null => {
  const existing = tree[part];
  if (existing === null && !isLeaf) {
    const promotedPathNode = createPathTreeNode();
    tree[part] = promotedPathNode;
    return promotedPathNode;
  }

  if (existing !== undefined) {
    return existing;
  }

  const nextValue = isLeaf ? null : createPathTreeNode();
  tree[part] = nextValue;
  return nextValue;
};

const addFilePathToTree = (pathTree: PathTree, filePath: string): void => {
  const parts = filePath.split('/');
  let currentLevel: PathTree = pathTree;

  for (const [index, part] of parts.entries()) {
    const isLeaf = index === parts.length - 1;
    const nextLevel = upsertPathPart(currentLevel, part, isLeaf);

    if (isLeaf) {
      continue;
    }

    if (nextLevel === null) {
      break;
    }

    currentLevel = nextLevel;
  }
};

const buildPathTree = (filesInfo: FileInfo[]): PathTree => {
  const pathTree = createPathTreeNode();
  const sortedFiles = [...filesInfo].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sortedFiles) {
    if (!file?.path) {
      continue;
    }
    addFilePathToTree(pathTree, file.path);
  }

  return pathTree;
};

const renderTreeView = (tree: PathTree, prefix = ''): string => {
  const entries = Object.entries(tree);
  let result = '';

  entries.forEach(([key, value], index) => {
    const isLastItem = index === entries.length - 1;
    result += `${prefix}${isLastItem ? '└── ' : '├── '}${key}\n`;

    if (value !== null) {
      const nextPrefix = `${prefix}${isLastItem ? '    ' : '│   '}`;
      result += renderTreeView(value, nextPrefix);
    }
  });

  return result;
};

const generateTreeView = (filesInfo: FileInfo[]): string => {
  if (!Array.isArray(filesInfo)) {
    return '';
  }
  return renderTreeView(buildPathTree(filesInfo));
};

const buildRepositoryHeader = (
  processingOptions: RepositoryProcessingOptions,
  treeView: string | undefined,
  filesInfo: FileInfo[]
): string => {
  let header =
    processingOptions.exportFormat === 'xml'
      ? '<?xml version="1.0" encoding="UTF-8"?>\n<repositoryContent>\n'
      : '# Repository Content\n\n';

  if (processingOptions.includeTreeView) {
    const resolvedTreeView = treeView || generateTreeView(filesInfo);
    if (processingOptions.exportFormat === 'xml') {
      header += `<fileStructure>${wrapXmlCdata(resolvedTreeView)}</fileStructure>\n`;
    } else {
      header += '## File Structure\n\n';
      header += '```\n';
      header += resolvedTreeView;
      header += '```\n\n';
    }
  }

  if (processingOptions.exportFormat === 'markdown' && processingOptions.includeTreeView) {
    header += '## File Contents\n\n';
  }

  if (processingOptions.exportFormat === 'xml') {
    header += '<files>\n';
  }

  return header;
};

const processRepositoryFile = (
  rootPath: string,
  fileInfo: FileInfo,
  contentProcessor: ContentProcessor,
  processingOptions: RepositoryProcessingOptions,
  onWarn?: (message: string) => void
): ProcessedRepositoryFileResult => {
  const filePath = fileInfo.path;
  const tokenCount = normalizeTokenCount(fileInfo.tokens);
  const fullPath = path.resolve(rootPath, filePath);

  if (!isPathWithinRoot(rootPath, fullPath)) {
    onWarn?.(`Skipping file outside root directory: ${filePath}`);
    return null;
  }

  if (!fs.existsSync(fullPath)) {
    onWarn?.(`File not found: ${filePath}`);
    return null;
  }

  const content = contentProcessor.processFile(fullPath, filePath, {
    exportFormat: processingOptions.exportFormat,
    showTokenCount: processingOptions.showTokenCount,
    tokenCount,
  });
  if (!content) {
    return null;
  }

  return { content, tokenCount };
};

const buildRepositoryFooter = (
  processingOptions: RepositoryProcessingOptions,
  summary: { totalTokens: number; processedFiles: number; skippedFiles: number }
): string => {
  if (processingOptions.exportFormat === 'xml') {
    return (
      '</files>\n' +
      `<summary totalTokens="${toXmlNumericAttribute(summary.totalTokens)}" ` +
      `processedFiles="${toXmlNumericAttribute(summary.processedFiles)}" ` +
      `skippedFiles="${toXmlNumericAttribute(summary.skippedFiles)}" />\n` +
      '</repositoryContent>\n'
    );
  }

  return '\n--END--\n';
};

export const processRepository = ({
  rootPath,
  filesInfo,
  treeView,
  options,
  onWarn,
  onInfo,
}: ProcessRepositoryInput): ProcessRepositoryResult => {
  const tokenCounter = new TokenCounter();
  const contentProcessor = new ContentProcessor(tokenCounter);
  const processingOptions = resolveRepositoryProcessingOptions(options);
  onInfo?.('Processing with options:', processingOptions);

  const normalizedFilesInfo = filesInfo ?? [];
  let processedContent = buildRepositoryHeader(
    processingOptions,
    treeView ?? undefined,
    normalizedFilesInfo
  );

  let totalTokens = 0;
  let processedFiles = 0;
  let skippedFiles = 0;

  for (const fileInfo of normalizedFilesInfo) {
    if (!fileInfo?.path) {
      onWarn?.('Skipping invalid file info entry');
      skippedFiles++;
      continue;
    }

    try {
      const processedFile = processRepositoryFile(
        rootPath,
        fileInfo,
        contentProcessor,
        processingOptions,
        onWarn
      );
      if (!processedFile) {
        skippedFiles++;
        continue;
      }

      processedContent += processedFile.content;
      totalTokens += processedFile.tokenCount;
      processedFiles++;
    } catch (error) {
      onWarn?.(`Failed to process file: ${getErrorMessage(error)}`);
      skippedFiles++;
    }
  }

  processedContent += buildRepositoryFooter(processingOptions, {
    totalTokens,
    processedFiles,
    skippedFiles,
  });

  return {
    content: processedContent,
    exportFormat: processingOptions.exportFormat,
    totalTokens,
    processedFiles,
    skippedFiles,
    filesInfo: normalizedFilesInfo,
  };
};
