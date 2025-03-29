const { contextBridge, ipcRenderer } = require('electron');

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
});
