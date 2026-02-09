import { contextBridge, ipcRenderer, shell } from 'electron';
import type {
  AnalyzeRepositoryOptions,
  AnalyzeRepositoryResult,
  CountFilesTokensOptions,
  CountFilesTokensResult,
  DirectoryTreeItem,
  ElectronApi,
  ProcessRepositoryOptions,
  ProcessRepositoryResult,
  SaveFileOptions,
} from '../types/ipc';

type DevUtils = {
  clearLocalStorage: () => boolean;
  isDev: boolean;
};

type ElectronShellApi = {
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
};

const isDev = process.env.NODE_ENV === 'development';

const devUtils: DevUtils = {
  clearLocalStorage: () => isDev,
  isDev,
};

const electronShellApi: ElectronShellApi = {
  shell: {
    openExternal: (url: string) => shell.openExternal(url),
  },
};

const electronAPI: ElectronApi = {
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory') as Promise<string | null>,
  getDirectoryTree: (dirPath: string, configContent?: string | null) =>
    ipcRenderer.invoke('fs:getDirectoryTree', dirPath, configContent) as Promise<
      DirectoryTreeItem[]
    >,
  saveFile: (options: SaveFileOptions) =>
    ipcRenderer.invoke('fs:saveFile', options) as Promise<string | null>,
  resetGitignoreCache: () => ipcRenderer.invoke('gitignore:resetCache') as Promise<boolean>,
  analyzeRepository: (options: AnalyzeRepositoryOptions) =>
    ipcRenderer.invoke('repo:analyze', options) as Promise<AnalyzeRepositoryResult>,
  processRepository: (options: ProcessRepositoryOptions) =>
    ipcRenderer.invoke('repo:process', options) as Promise<ProcessRepositoryResult>,
  getDefaultConfig: () => ipcRenderer.invoke('config:getDefault') as Promise<string>,
  getAssetPath: (assetName: string) =>
    ipcRenderer.invoke('assets:getPath', assetName) as Promise<string | null>,
  countFilesTokens: (options: CountFilesTokensOptions) =>
    ipcRenderer.invoke('tokens:countFiles', options) as Promise<CountFilesTokensResult>,
};

contextBridge.exposeInMainWorld('devUtils', devUtils);
contextBridge.exposeInMainWorld('electron', electronShellApi);
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
