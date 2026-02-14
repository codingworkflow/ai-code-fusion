jest.unmock('fs');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { processRepository } from '../../../src/main/services/repository-processing';

import type { FileInfo } from '../../../src/types/ipc';

const createTempRepository = () => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-processing-'));
  const createFile = (relativePath: string, content: string) => {
    const fullPath = path.join(rootPath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  };

  return {
    rootPath,
    createFile,
    cleanup: () => {
      fs.rmSync(rootPath, { recursive: true, force: true });
    },
  };
};

describe('repository-processing service', () => {
  test('processes markdown output and skips invalid/missing/out-of-root entries', () => {
    const { rootPath, createFile, cleanup } = createTempRepository();
    try {
      createFile('src/index.js', 'const answer = 42;\n');
      const warnMock = jest.fn();
      const invalidFileEntry = null as unknown as FileInfo;

      const result = processRepository({
        rootPath,
        filesInfo: [
          { path: 'src/index.js', tokens: 12 },
          { path: '../outside.js', tokens: 2 },
          { path: 'missing.js', tokens: 1 },
          invalidFileEntry,
        ],
        onWarn: warnMock,
      });

      expect(result.exportFormat).toBe('markdown');
      expect(result.processedFiles).toBe(1);
      expect(result.skippedFiles).toBe(3);
      expect(result.content).toContain('# Repository Content');
      expect(result.content).toContain('src/index.js');
      expect(result.content).toContain('--END--');
      expect(warnMock).toHaveBeenCalledWith(
        expect.stringContaining('Skipping file outside root directory')
      );
      expect(warnMock).toHaveBeenCalledWith(expect.stringContaining('File not found'));
      expect(warnMock).toHaveBeenCalledWith('Skipping invalid file info entry');
    } finally {
      cleanup();
    }
  });

  test('generates tree view section when includeTreeView is enabled', () => {
    const { rootPath, createFile, cleanup } = createTempRepository();
    try {
      createFile('src/index.js', 'console.log("tree");\n');
      createFile('README.md', '# Readme\n');

      const result = processRepository({
        rootPath,
        filesInfo: [
          { path: 'src/index.js', tokens: 5 },
          { path: 'README.md', tokens: 3 },
        ],
        options: { includeTreeView: true },
      });

      expect(result.content).toContain('## File Structure');
      expect(result.content).toContain('src');
      expect(result.content).toContain('README.md');
      expect(result.content).toContain('## File Contents');
    } finally {
      cleanup();
    }
  });

  test('keeps xml token attributes enabled by default', () => {
    const { rootPath, createFile, cleanup } = createTempRepository();
    try {
      createFile('src/index.js', 'console.log("xml");\n');

      const result = processRepository({
        rootPath,
        filesInfo: [{ path: 'src/index.js', tokens: 42 }],
        options: { exportFormat: 'xml' },
      });

      expect(result.exportFormat).toBe('xml');
      expect(result.content).toContain('<file path="src/index.js" tokens="42" binary="false">');
      expect(result.content).toContain(
        '<summary totalTokens="42" processedFiles="1" skippedFiles="0" />'
      );
    } finally {
      cleanup();
    }
  });

  test('omits xml token attributes when showTokenCount is false', () => {
    const { rootPath, createFile, cleanup } = createTempRepository();
    try {
      createFile('src/index.js', 'console.log("xml no token");\n');

      const result = processRepository({
        rootPath,
        filesInfo: [{ path: 'src/index.js', tokens: 42 }],
        options: {
          exportFormat: 'xml',
          showTokenCount: false,
        },
      });

      expect(result.exportFormat).toBe('xml');
      expect(result.content).toContain('<file path="src/index.js" binary="false">');
      expect(result.content).not.toContain('tokens="42"');
    } finally {
      cleanup();
    }
  });
});
