import type { ElectronApi } from './ipc';

declare global {
  interface Window {
    electronAPI?: ElectronApi;
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
