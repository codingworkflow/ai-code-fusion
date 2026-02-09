export type TabId = 'config' | 'source' | 'processed';
export type ExportFormat = 'markdown' | 'xml';
export type UpdaterChannel = 'alpha' | 'stable';
export type UpdaterState = 'disabled' | 'up-to-date' | 'update-available' | 'error';

export type SelectionHandler = (path: string, isSelected: boolean) => void;

export interface ConfigObject {
  include_extensions?: string[];
  exclude_patterns?: string[];
  use_custom_excludes?: boolean;
  use_custom_includes?: boolean;
  use_gitignore?: boolean;
  enable_secret_scanning?: boolean;
  exclude_suspicious_files?: boolean;
  include_tree_view?: boolean;
  show_token_count?: boolean;
  export_format?: ExportFormat;
}

export interface DirectoryTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  lastModified?: Date;
  extension?: string;
  children?: DirectoryTreeItem[];
  itemCount?: number;
}

export interface FileInfo {
  path: string;
  tokens: number;
  isBinary?: boolean;
}

export interface AnalyzeRepositoryOptions {
  rootPath: string;
  configContent: string;
  selectedFiles: string[];
}

export interface AnalyzeRepositoryResult {
  filesInfo: FileInfo[];
  totalTokens: number;
  skippedBinaryFiles: number;
}

export interface ProcessRepositoryOptions {
  rootPath: string;
  filesInfo: FileInfo[];
  treeView?: string | null;
  options?: {
    showTokenCount?: boolean;
    includeTreeView?: boolean;
    exportFormat?: ExportFormat;
  };
}

export interface ProcessRepositoryResult {
  content: string;
  exportFormat: ExportFormat;
  totalTokens: number;
  processedFiles: number;
  skippedFiles: number;
  filesInfo: FileInfo[];
}

export interface SaveFileOptions {
  content: string;
  defaultPath: string;
}

export interface CountFilesTokensResult {
  results: Record<string, number>;
  stats: Record<string, { size: number; mtime: number }>;
}

export interface CountFilesTokensOptions {
  rootPath: string;
  filePaths: string[];
}

export interface UpdaterStatus {
  enabled: boolean;
  platformSupported: boolean;
  channel: UpdaterChannel;
  allowPrerelease: boolean;
  currentVersion: string;
  owner: string;
  repo: string;
  reason?: string;
}

export interface UpdateCheckResult extends UpdaterStatus {
  state: UpdaterState;
  updateAvailable: boolean;
  latestVersion?: string;
  releaseName?: string;
  errorMessage?: string;
}

export interface ElectronApi {
  selectDirectory: () => Promise<string | null>;
  getDirectoryTree: (
    dirPath: string,
    configContent?: string | null
  ) => Promise<DirectoryTreeItem[]>;
  saveFile: (options: SaveFileOptions) => Promise<string | null>;
  resetGitignoreCache: () => Promise<boolean>;
  analyzeRepository: (options: AnalyzeRepositoryOptions) => Promise<AnalyzeRepositoryResult>;
  processRepository: (options: ProcessRepositoryOptions) => Promise<ProcessRepositoryResult>;
  getDefaultConfig: () => Promise<string>;
  getAssetPath: (assetName: string) => Promise<string | null>;
  countFilesTokens: (options: CountFilesTokensOptions) => Promise<CountFilesTokensResult>;
  getUpdaterStatus: () => Promise<UpdaterStatus>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
}
