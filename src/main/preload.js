const { contextBridge, ipcRenderer, shell } = require('electron');

// Expose development utilities for managing localStorage
const isDev = process.env.NODE_ENV === 'development';
contextBridge.exposeInMainWorld('devUtils', {
  clearLocalStorage: () => {
    // Signal to clear, but actual clearing happens in renderer
    return isDev;
  },
  isDev: isDev,
});

// Expose electron shell for external links
contextBridge.exposeInMainWorld('electron', {
  shell: {
    openExternal: (url) => shell.openExternal(url),
  },
});

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  getDirectoryTree: (dirPath, configContent) =>
    ipcRenderer.invoke('fs:getDirectoryTree', dirPath, configContent),
  saveFile: (options) => ipcRenderer.invoke('fs:saveFile', options),

  // Gitignore operations
  resetGitignoreCache: () => ipcRenderer.invoke('gitignore:resetCache'),

  // Repository operations
  analyzeRepository: (options) => ipcRenderer.invoke('repo:analyze', options),
  processRepository: (options) => ipcRenderer.invoke('repo:process', options),

  // Configuration operations
  getDefaultConfig: () => ipcRenderer.invoke('config:getDefault'),

  // Asset operations
  getAssetPath: (assetName) => ipcRenderer.invoke('assets:getPath', assetName),

  // Token counting
  countFilesTokens: (filePaths) => ipcRenderer.invoke('tokens:countFiles', filePaths),
});
