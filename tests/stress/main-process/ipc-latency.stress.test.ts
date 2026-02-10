const fs = require('fs');
const yaml = require('yaml');

const mockIpcHandlers = {};
const mockAutoUpdater = {
  checkForUpdates: jest.fn(),
  setFeedURL: jest.fn(),
  allowPrerelease: false,
  autoDownload: true,
  autoInstallOnAppQuit: false,
  channel: undefined,
};

jest.mock('electron', () => ({
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
    },
  })),
  ipcMain: {
    handle: jest.fn((channel, handler) => {
      mockIpcHandlers[channel] = handler;
    }),
  },
  dialog: {
    showOpenDialog: jest.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/mock/repo'],
    }),
    showSaveDialog: jest.fn(),
  },
  protocol: {
    handle: jest.fn(),
  },
  net: {
    fetch: jest.fn().mockResolvedValue({ ok: true, status: 200, url: 'file:///mock/icon.png' }),
  },
}));

jest.mock('fs');
jest.mock('yaml');
jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}));
jest.mock('../../../src/utils/token-counter', () => ({
  TokenCounter: jest.fn().mockImplementation(() => ({
    countTokens: jest.fn().mockReturnValue(100),
  })),
}));
jest.mock('../../../src/utils/gitignore-parser', () => ({
  GitignoreParser: jest.fn().mockImplementation(() => ({
    parseGitignore: jest.fn().mockReturnValue({
      excludePatterns: [],
      includePatterns: [],
    }),
    clearCache: jest.fn(),
  })),
}));
jest.mock('../../../src/utils/file-analyzer', () => ({
  FileAnalyzer: jest.fn().mockImplementation(() => ({
    shouldProcessFile: jest.fn().mockReturnValue(true),
    analyzeFile: jest.fn().mockReturnValue(100),
  })),
  isBinaryFile: jest.fn().mockReturnValue(false),
}));

require('../../../src/main/index');

const percentile = (values: number[], p: number): number => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
};

const writeBenchmarkArtifact = (fileNamePrefix: string, payload: Record<string, unknown>) => {
  const actualFs = jest.requireActual('fs');
  const actualPath = jest.requireActual('path');
  const outputDir = actualPath.join(process.cwd(), 'dist', 'benchmarks');
  actualFs.mkdirSync(outputDir, { recursive: true });
  const outputPath = actualPath.join(outputDir, `${fileNamePrefix}-${Date.now()}.json`);
  actualFs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
};

describe('Main Process IPC Stress Benchmarks', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    fs.readdirSync.mockImplementation((dirPath) => {
      if (dirPath === '/mock/repo') {
        return [];
      }
      return [];
    });
    fs.statSync.mockImplementation(() => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 1000,
      mtime: new Date(),
    }));
    if (typeof fs.lstatSync !== 'function') {
      fs.lstatSync = jest.fn();
    }
    fs.lstatSync.mockImplementation(() => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 1000,
      mtime: new Date(),
    }));
    if (typeof fs.realpathSync !== 'function') {
      fs.realpathSync = jest.fn();
    }
    fs.realpathSync.mockImplementation((inputPath) => inputPath);
    fs.realpathSync.native = fs.realpathSync;
    yaml.parse.mockImplementation(() => ({
      use_custom_excludes: true,
      use_custom_includes: true,
      use_gitignore: false,
      include_extensions: ['.ts'],
      exclude_patterns: [],
    }));

    const selectDirectoryHandler = mockIpcHandlers['dialog:selectDirectory'];
    expect(selectDirectoryHandler).toBeDefined();
    await selectDirectoryHandler(null);
  });

  test('collects latency distribution for fs:getDirectoryTree on large flat trees', async () => {
    const fileCount = 5000;
    const files = Array.from({ length: fileCount }, (_, index) => `file-${index}.ts`);

    fs.readdirSync.mockImplementation((dirPath) => {
      if (dirPath === '/mock/repo') {
        return files;
      }
      return [];
    });
    fs.statSync.mockImplementation(() => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 128,
      mtime: new Date(),
    }));
    fs.lstatSync.mockImplementation(() => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 128,
      mtime: new Date(),
    }));

    const handler = mockIpcHandlers['fs:getDirectoryTree'];
    expect(handler).toBeDefined();

    const durationsMs: number[] = [];
    let firstResultLength = 0;
    for (let i = 0; i < 7; i++) {
      const startedAt = process.hrtime.bigint();
      const result = await handler(null, '/mock/repo', '');
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      if (i === 0) {
        firstResultLength = Array.isArray(result) ? result.length : 0;
      }
      if (i >= 2) {
        durationsMs.push(durationMs);
      }
    }

    const metrics = {
      scenario: 'fs:getDirectoryTree-large-flat',
      fileCount,
      runs: durationsMs,
      p50Ms: percentile(durationsMs, 50),
      p95Ms: percentile(durationsMs, 95),
      p99Ms: percentile(durationsMs, 99),
    };
    writeBenchmarkArtifact('ipc-latency', metrics);

    expect(firstResultLength).toBe(fileCount);
    expect(metrics.runs.length).toBe(5);
    expect(metrics.p95Ms).toBeGreaterThanOrEqual(0);
  });

  test('collects event-loop lag samples while repeatedly walking directories', async () => {
    const fileCount = 2000;
    const files = Array.from({ length: fileCount }, (_, index) => `node-${index}.ts`);

    fs.readdirSync.mockImplementation((dirPath) => {
      if (dirPath === '/mock/repo') {
        return files;
      }
      return [];
    });
    fs.statSync.mockImplementation(() => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 64,
      mtime: new Date(),
    }));
    fs.lstatSync.mockImplementation(() => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 64,
      mtime: new Date(),
    }));

    const handler = mockIpcHandlers['fs:getDirectoryTree'];
    expect(handler).toBeDefined();

    const lagSamplesMs: number[] = [];
    const sampleLag = async (): Promise<number> => {
      const scheduledAt = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return Date.now() - scheduledAt;
    };

    for (let i = 0; i < 20; i++) {
      await handler(null, '/mock/repo', '');
      lagSamplesMs.push(await sampleLag());
    }

    const metrics = {
      scenario: 'fs:getDirectoryTree-event-loop-lag',
      iterations: 20,
      lagSamplesMs,
      p50LagMs: percentile(lagSamplesMs, 50),
      p95LagMs: percentile(lagSamplesMs, 95),
      p99LagMs: percentile(lagSamplesMs, 99),
    };
    writeBenchmarkArtifact('event-loop-lag', metrics);

    expect(lagSamplesMs.length).toBe(20);
    expect(metrics.p95LagMs).toBeGreaterThanOrEqual(0);
  });
});
