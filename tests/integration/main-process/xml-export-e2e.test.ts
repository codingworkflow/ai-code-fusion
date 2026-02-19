const os = require('os');
const path = require('path');

jest.unmock('fs');
jest.unmock('../../../src/utils/content-processor');

const fs = require('fs');

describe('XML export end-to-end', () => {
  const mockIpcHandlers = {};
  let tempRoot = '';
  let mockShowOpenDialog;
  let mockShowSaveDialog;
  let mockNetFetch;

  beforeEach(() => {
    jest.resetModules();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-code-fusion-xml-'));
    Object.keys(mockIpcHandlers).forEach((key) => {
      delete mockIpcHandlers[key];
    });
    mockShowOpenDialog = jest.fn();
    mockShowSaveDialog = jest.fn();
    mockNetFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, url: 'file:///mock.png' });

    jest.doMock('electron', () => ({
      app: {
        whenReady: jest.fn().mockResolvedValue(),
        on: jest.fn(),
        setAppUserModelId: jest.fn(),
        quit: jest.fn(),
        getVersion: jest.fn().mockReturnValue('0.2.0'),
      },
      BrowserWindow: jest.fn().mockImplementation(() => ({
        loadFile: jest.fn().mockResolvedValue(null),
        on: jest.fn(),
        setMenu: jest.fn(),
        webContents: {
          openDevTools: jest.fn(),
          setWindowOpenHandler: jest.fn(),
          on: jest.fn(),
        },
      })),
      ipcMain: {
        handle: jest.fn((channel, handler) => {
          mockIpcHandlers[channel] = handler;
        }),
      },
      dialog: {
        showOpenDialog: mockShowOpenDialog,
        showSaveDialog: mockShowSaveDialog,
      },
      net: {
        fetch: mockNetFetch,
      },
      shell: {
        openExternal: jest.fn().mockResolvedValue(undefined),
      },
      protocol: {
        handle: jest.fn(),
      },
    }));

    jest.doMock('electron-updater', () => ({
      autoUpdater: {
        checkForUpdates: jest.fn().mockResolvedValue({
          updateInfo: { version: '0.2.1' },
        }),
        setFeedURL: jest.fn(),
        allowPrerelease: false,
        autoDownload: true,
        autoInstallOnAppQuit: false,
        channel: undefined,
      },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/index');
    });
  });

  afterEach(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('generates well-formed xml structure with safe content handling', async () => {
    const srcDir = path.join(tempRoot, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const filePath = path.join(srcDir, 'sample.ts');
    const fileContent = 'const marker = "]]>";\nconst invalid = "\u0001";\nconst done = true;\n';
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    const repoProcessHandler = mockIpcHandlers['repo:process'];
    const selectDirectoryHandler = mockIpcHandlers['dialog:selectDirectory'];
    expect(repoProcessHandler).toBeDefined();
    expect(selectDirectoryHandler).toBeDefined();

    mockShowOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [tempRoot],
    });
    await selectDirectoryHandler(null);

    const result = await repoProcessHandler(null, {
      rootPath: tempRoot,
      filesInfo: [{ path: 'src/sample.ts', tokens: 123 }],
      treeView: '/ mock-repository\n└── src\n    └── sample.ts',
      options: {
        exportFormat: 'xml',
        includeTreeView: true,
        showTokenCount: true,
      },
    });

    expect(result.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result.exportFormat).toBe('xml');
    expect(result.content).toContain('<repositoryContent>');
    expect(result.content).toContain('<fileStructure><![CDATA[');
    expect(result.content).toContain('<files>');
    expect(result.content).toContain('<file path="src/sample.ts" tokens="123" binary="false">');
    expect(result.content).toContain(']]]]><![CDATA[>');
    expect(result.content).not.toContain('\u0001');
    expect(result.content).toContain(
      '<summary totalTokens="123" processedFiles="1" skippedFiles="0" />'
    );
    expect(result.content).toContain('</repositoryContent>');
    expect(result.totalTokens).toBe(123);
    expect(result.processedFiles).toBe(1);
    expect(result.skippedFiles).toBe(0);
  });
});
