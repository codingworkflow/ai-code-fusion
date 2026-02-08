import type { ElectronApi, TabId } from './ipc';

declare global {
  interface Window {
    electronAPI?: ElectronApi;
    switchToTab?: (tab: TabId) => void;
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
