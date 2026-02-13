jest.unmock('fs');
jest.unmock('path');

const { Linter } = require('eslint');

const electronSecurityPlugin = require('../../../eslint-rules/electron-security');

const lintWithRule = ({ ruleName, code, filename = '/workspace/test.js' }) => {
  const linter = new Linter({ configType: 'eslintrc' });
  linter.defineRule(`electron-security/${ruleName}`, electronSecurityPlugin.rules[ruleName]);

  return linter.verify(
    code,
    {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      rules: {
        [`electron-security/${ruleName}`]: 'error',
      },
    },
    filename
  );
};

describe('electron custom eslint rules', () => {
  test('safe-browser-window-webpreferences enforces secure BrowserWindow flags', () => {
    const valid = lintWithRule({
      ruleName: 'safe-browser-window-webpreferences',
      code: 'new BrowserWindow({ webPreferences: { nodeIntegration: false, contextIsolation: true } });',
      filename: '/workspace/src/main/index.ts',
    });

    expect(valid).toHaveLength(0);

    const invalidFlags = lintWithRule({
      ruleName: 'safe-browser-window-webpreferences',
      code: 'new BrowserWindow({ webPreferences: { nodeIntegration: true } });',
      filename: '/workspace/src/main/index.ts',
    });

    expect(invalidFlags.some((message) => message.messageId === 'requireNodeIntegrationFalse')).toBe(true);
    expect(invalidFlags.some((message) => message.messageId === 'requireContextIsolationTrue')).toBe(true);

    const missingOptions = lintWithRule({
      ruleName: 'safe-browser-window-webpreferences',
      code: 'new BrowserWindow();',
      filename: '/workspace/src/main/index.ts',
    });

    expect(missingOptions.some((message) => message.messageId === 'requireWebPreferences')).toBe(true);

    const missingWebPreferences = lintWithRule({
      ruleName: 'safe-browser-window-webpreferences',
      code: 'new BrowserWindow({});',
      filename: '/workspace/src/main/index.ts',
    });

    expect(missingWebPreferences.some((message) => message.messageId === 'requireWebPreferences')).toBe(true);

    const missingNodeIntegration = lintWithRule({
      ruleName: 'safe-browser-window-webpreferences',
      code: 'new BrowserWindow({ webPreferences: { contextIsolation: true } });',
      filename: '/workspace/src/main/index.ts',
    });

    expect(
      missingNodeIntegration.some((message) => message.messageId === 'requireNodeIntegrationFalse')
    ).toBe(true);

    const missingContextIsolation = lintWithRule({
      ruleName: 'safe-browser-window-webpreferences',
      code: 'new BrowserWindow({ webPreferences: { nodeIntegration: false } });',
      filename: '/workspace/src/main/index.ts',
    });

    expect(
      missingContextIsolation.some((message) => message.messageId === 'requireContextIsolationTrue')
    ).toBe(true);
  });

  test('ipc-channel-namespaced requires literal namespaced channel names', () => {
    const valid = lintWithRule({
      ruleName: 'ipc-channel-namespaced',
      code: "ipcMain.handle('repo:process', () => {}); ipcRenderer.invoke('tokens:countFiles'); ipcMain?.on('repo:process', () => {});",
      filename: '/workspace/src/main/preload.ts',
    });

    expect(valid).toHaveLength(0);

    const invalid = lintWithRule({
      ruleName: 'ipc-channel-namespaced',
      code: "const channel = 'repo:process'; ipcMain.handle(channel, () => {}); ipcRenderer.invoke('badChannel'); ipcRenderer?.invoke('stillBad');",
      filename: '/workspace/src/main/preload.ts',
    });

    expect(invalid).toHaveLength(3);
    expect(invalid.every((message) => message.message.includes('namespaced format'))).toBe(true);
  });

  test('no-electron-import-in-renderer blocks electron imports in renderer paths only', () => {
    const mainProcessImport = lintWithRule({
      ruleName: 'no-electron-import-in-renderer',
      code: "import { shell } from 'electron';",
      filename: '/workspace/src/main/preload.ts',
    });

    expect(mainProcessImport).toHaveLength(0);

    const rendererImport = lintWithRule({
      ruleName: 'no-electron-import-in-renderer',
      code: "import { ipcRenderer } from 'electron';",
      filename: '/workspace/src/renderer/components/App.tsx',
    });

    expect(rendererImport).toHaveLength(1);
    expect(rendererImport[0].message).toContain('Do not import electron directly in renderer files');
  });

  test('no-electron-import-in-renderer blocks require("electron") only in renderer paths', () => {
    const mainProcessRequire = lintWithRule({
      ruleName: 'no-electron-import-in-renderer',
      code: "const { shell } = require('electron');",
      filename: '/workspace/src/main/preload.ts',
    });

    expect(mainProcessRequire).toHaveLength(0);

    const rendererRequire = lintWithRule({
      ruleName: 'no-electron-import-in-renderer',
      code: "const { ipcRenderer } = require('electron');",
      filename: '/workspace/src/renderer/components/App.tsx',
    });

    expect(rendererRequire).toHaveLength(1);
    expect(rendererRequire[0].message).toContain('Do not import electron directly in renderer files');
  });

  test('no-electron-import-in-renderer blocks dynamic import("electron") only in renderer paths', () => {
    const mainProcessDynamicImport = lintWithRule({
      ruleName: 'no-electron-import-in-renderer',
      code: "async function load() { await import('electron'); }",
      filename: '/workspace/src/main/preload.ts',
    });

    expect(mainProcessDynamicImport).toHaveLength(0);

    const rendererDynamicImport = lintWithRule({
      ruleName: 'no-electron-import-in-renderer',
      code: "async function load() { await import('electron'); }",
      filename: '/workspace/src/renderer/components/App.tsx',
    });

    expect(rendererDynamicImport).toHaveLength(1);
    expect(rendererDynamicImport[0].message).toContain(
      'Do not import electron directly in renderer files'
    );
  });
});
