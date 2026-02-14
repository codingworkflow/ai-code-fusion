import path from 'path';

import yaml from 'yaml';

import { FileAnalyzer, isBinaryFile } from '../../utils/file-analyzer';
import { getRelativePath } from '../../utils/filter-utils';
import { TokenCounter } from '../../utils/token-counter';
import { isPathWithinRoot } from '../security/path-guard';

import type { AnalyzeRepositoryResult, ConfigObject, FileInfo } from '../../types/ipc';

type GitignorePatterns = {
  excludePatterns: string[];
  includePatterns: string[];
};

type GitignoreParserLike = {
  parseGitignore: (rootPath: string) => GitignorePatterns;
};

type AnalyzeRepositoryInput = {
  rootPath: string;
  configContent: string;
  selectedFiles: string[];
  gitignoreParser: GitignoreParserLike;
  onWarn?: (message: string) => void;
  onInfo?: (message: string) => void;
};

const EMPTY_GITIGNORE_PATTERNS: GitignorePatterns = {
  excludePatterns: [],
  includePatterns: [],
};

export const analyzeRepository = ({
  rootPath,
  configContent,
  selectedFiles,
  gitignoreParser,
  onWarn,
  onInfo,
}: AnalyzeRepositoryInput): AnalyzeRepositoryResult => {
  const config = (yaml.parse(configContent) || {}) as ConfigObject;
  const localTokenCounter = new TokenCounter();

  let gitignorePatterns = EMPTY_GITIGNORE_PATTERNS;
  if (config.use_gitignore !== false) {
    gitignorePatterns = gitignoreParser.parseGitignore(rootPath);
  }

  const fileAnalyzer = new FileAnalyzer(config, localTokenCounter, {
    useGitignore: config.use_gitignore !== false,
    gitignorePatterns,
  });

  const filesInfo: FileInfo[] = [];
  let totalTokens = 0;
  let skippedBinaryFiles = 0;

  for (const filePath of selectedFiles) {
    const resolvedFilePath = path.resolve(rootPath, filePath);
    if (!isPathWithinRoot(rootPath, resolvedFilePath)) {
      onWarn?.(`Skipping file outside current root directory: ${filePath}`);
      continue;
    }

    const relativePath = getRelativePath(resolvedFilePath, rootPath);
    const binaryFile = isBinaryFile(resolvedFilePath);
    if (binaryFile) {
      onInfo?.(`Binary file detected (will skip processing): ${relativePath}`);
      skippedBinaryFiles++;
      filesInfo.push({
        path: relativePath,
        tokens: 0,
        isBinary: true,
      });
      continue;
    }

    if (!fileAnalyzer.shouldProcessFile(relativePath)) {
      continue;
    }

    const tokenCount = fileAnalyzer.analyzeFile(resolvedFilePath);
    if (tokenCount === null) {
      continue;
    }

    filesInfo.push({
      path: relativePath,
      tokens: tokenCount,
    });
    totalTokens += tokenCount;
  }

  filesInfo.sort((a, b) => b.tokens - a.tokens);
  onInfo?.(`Skipped ${skippedBinaryFiles} binary files during analysis`);

  return {
    filesInfo,
    totalTokens,
    skippedBinaryFiles,
  };
};
