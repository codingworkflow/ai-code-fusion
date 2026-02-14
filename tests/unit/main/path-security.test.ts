import fs from 'fs';
import os from 'node:os';
import path from 'path';

import {
  isPathWithinRoot,
  isPathWithinTempRoot,
  resolveAuthorizedPath,
  resolveRealPath,
} from '../../../src/main/security/path-guard';

type RealPathSync = ((value: string) => string) & { native?: (value: string) => string };
type MockedFsWithRealPath = {
  realpathSync?: RealPathSync;
};

const fsWithRealPath = fs as unknown as MockedFsWithRealPath;
const originalRealPathSync = fsWithRealPath.realpathSync;

describe('path-guard', () => {
  afterEach(() => {
    fsWithRealPath.realpathSync = originalRealPathSync;
    jest.restoreAllMocks();
  });

  test('allows paths within root and rejects paths outside root', () => {
    const rootPath = path.resolve('/tmp/path-guard-root');
    const inRootPath = path.join(rootPath, 'nested', 'file.txt');
    const outOfRootPath = path.resolve(rootPath, '..', 'outside-root.txt');

    expect(isPathWithinRoot(rootPath, rootPath)).toBe(true);
    expect(isPathWithinRoot(rootPath, inRootPath)).toBe(true);
    expect(isPathWithinRoot(rootPath, outOfRootPath)).toBe(false);
  });

  test('resolves candidate path only when authorized root allows it', () => {
    const rootPath = path.resolve('/tmp/path-guard-auth');
    const inRootPath = path.join(rootPath, 'nested');
    const outOfRootPath = path.resolve(rootPath, '..', 'outside-authorized-root');

    expect(resolveAuthorizedPath(rootPath, inRootPath)).toBe(path.resolve(inRootPath));
    expect(resolveAuthorizedPath(rootPath, outOfRootPath)).toBeNull();
    expect(resolveAuthorizedPath(null, inRootPath)).toBeNull();
    expect(resolveAuthorizedPath(rootPath, '')).toBeNull();
  });

  test('checks temp-root boundaries', () => {
    const tempRootPath = path.resolve('/tmp/path-guard-temp-root');
    const inTempRootPath = path.join(tempRootPath, 'state', 'session.json');
    const outOfTempRootPath = path.resolve(tempRootPath, '..', 'outside-temp-root');

    expect(isPathWithinTempRoot(tempRootPath, tempRootPath)).toBe(true);
    expect(isPathWithinTempRoot(inTempRootPath, tempRootPath)).toBe(true);
    expect(isPathWithinTempRoot(outOfTempRootPath, tempRootPath)).toBe(false);
    expect(isPathWithinTempRoot('', tempRootPath)).toBe(false);
  });

  test('defaults temp-root checks to os.tmpdir when root override is omitted', () => {
    const inOsTempRootPath = path.join(os.tmpdir(), 'path-guard-default-temp-root-check');
    const outOfOsTempRootPath = path.resolve('/path-guard-outside-temp-root');

    expect(isPathWithinTempRoot(inOsTempRootPath)).toBe(true);
    expect(isPathWithinTempRoot(outOfOsTempRootPath)).toBe(false);
  });

  test('uses realpath resolver when available and falls back on errors', () => {
    const symlinkPath = path.resolve('/tmp/path-guard-real/link');
    const canonicalPath = path.resolve('/tmp/path-guard-real/target');
    const realPathMock = jest.fn((value: string) => {
      if (value === symlinkPath) {
        return canonicalPath;
      }
      throw new Error('ENOENT');
    });
    realPathMock.native = realPathMock;
    fsWithRealPath.realpathSync = realPathMock;

    expect(resolveRealPath(symlinkPath)).toBe(canonicalPath);

    const missingPath = path.resolve('/tmp/path-guard-real/missing');
    expect(resolveRealPath(missingPath)).toBe(missingPath);
  });
});
