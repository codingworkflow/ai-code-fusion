import type { ElectronApi } from './ipc';

declare global {
  interface Window {
    electronAPI?: ElectronApi;
    switchToTab?: (tab: 'config' | 'source' | 'processed') => void;
    refreshDirectoryTree?: () => Promise<void>;
    electron?: {
      shell?: {
        openExternal?: (url: string) => Promise<void>;
      };
    };
    devUtils?: {
      clearLocalStorage: () => boolean;
      isDev: boolean;
    };
  }
}

export {};
