import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

import { getDirectoryTree } from '../../../src/main/services/directory-tree';

type MockStatsOptions = {
  isDirectory?: boolean;
  isSymbolicLink?: boolean;
  size?: number;
};

type FsWithTreeMethods = {
  readdirSync: jest.Mock;
  statSync: jest.Mock;
  lstatSync?: jest.Mock;
  realpathSync?: ((value: string) => string) & { native?: (value: string) => string };
};

type MockGitignoreParser = {
  parseGitignore: jest.Mock;
};

const fsWithTreeMethods = fs as unknown as FsWithTreeMethods;
const yamlParse = yaml.parse as jest.Mock;
const ROOT_PATH = path.join(path.sep, 'mock', 'repo');

const buildMockStats = ({
  isDirectory = false,
  isSymbolicLink = false,
  size = 1000,
}: MockStatsOptions = {}) => ({
  isDirectory: () => isDirectory,
  isSymbolicLink: () => isSymbolicLink,
  size,
  mtime: new Date('2024-01-01T00:00:00.000Z'),
});

const createGitignoreParser = (
  excludePatterns: string[] = [],
  includePatterns: string[] = []
): MockGitignoreParser => {
  return {
    parseGitignore: jest.fn().mockReturnValue({
      excludePatterns,
      includePatterns,
    }),
  };
};

const mockDirectoryEntries = (entriesByDirectory: Record<string, string[]>) => {
  fsWithTreeMethods.readdirSync.mockImplementation((directoryPath: string) => {
    return entriesByDirectory[directoryPath] ?? [];
  });
};

const mockPathStats = ({
  directories = [],
  symlinks = [],
}: {
  directories?: string[];
  symlinks?: string[];
}) => {
  const directorySet = new Set(directories);
  const symlinkSet = new Set(symlinks);

  fsWithTreeMethods.lstatSync?.mockImplementation((candidatePath: string) =>
    buildMockStats({
      isDirectory: directorySet.has(candidatePath),
      isSymbolicLink: symlinkSet.has(candidatePath),
    })
  );

  fsWithTreeMethods.statSync.mockImplementation((candidatePath: string) =>
    buildMockStats({
      isDirectory: directorySet.has(candidatePath),
    })
  );
};

describe('directory-tree service', () => {
  let originalRealPathSync: FsWithTreeMethods['realpathSync'];

  beforeEach(() => {
    jest.clearAllMocks();
    yamlParse.mockReset();
    fsWithTreeMethods.readdirSync.mockReset();
    fsWithTreeMethods.statSync.mockReset();

    if (typeof fsWithTreeMethods.lstatSync === 'function') {
      fsWithTreeMethods.lstatSync.mockReset();
    } else {
      fsWithTreeMethods.lstatSync = jest.fn();
    }

    originalRealPathSync = fsWithTreeMethods.realpathSync;
  });

  afterEach(() => {
    fsWithTreeMethods.realpathSync = originalRealPathSync;
  });

  test('applies custom excludes, include extensions, and gitignore rules', () => {
    yamlParse.mockReturnValue({
      use_custom_excludes: true,
      use_custom_includes: true,
      use_gitignore: true,
      include_extensions: ['.ts', '.log'],
      exclude_patterns: ['**/node_modules/**'],
    });

    const srcDirectoryPath = path.join(ROOT_PATH, 'src');
    const nodeModulesDirectoryPath = path.join(ROOT_PATH, 'node_modules');
    const gitignoreParser = createGitignoreParser(['*.log'], ['keep.log']);

    mockDirectoryEntries({
      [ROOT_PATH]: ['src', 'node_modules', 'keep.log', 'drop.log', 'README.md'],
      [srcDirectoryPath]: ['index.ts', 'helper.js'],
    });

    mockPathStats({
      directories: [srcDirectoryPath, nodeModulesDirectoryPath],
    });

    const result = getDirectoryTree({
      rootPath: ROOT_PATH,
      configContent: 'mocked: true',
      gitignoreParser,
    });

    expect(gitignoreParser.parseGitignore).toHaveBeenCalledWith(ROOT_PATH);
    expect(result.map((item) => item.name)).toEqual(['src', 'keep.log']);
    expect(result[0]).toEqual(
      expect.objectContaining({
        name: 'src',
        type: 'directory',
        itemCount: 1,
      })
    );
    expect(result[0].children?.map((item) => item.name)).toEqual(['index.ts']);
  });

  test('skips symlinks and warns when symlink resolves outside root', () => {
    yamlParse.mockReturnValue({ exclude_patterns: [] });

    const outsideLinkPath = path.join(ROOT_PATH, 'outside-link');
    const insideLinkPath = path.join(ROOT_PATH, 'inside-link');
    const outsideTargetPath = path.join(path.sep, 'outside', 'root', 'target');
    const resolvedOutsideLinkPath = path.resolve(outsideLinkPath);
    const resolvedOutsideTargetPath = path.resolve(outsideTargetPath);
    const gitignoreParser = createGitignoreParser();

    const realPathMock = jest.fn((candidatePath: string) => {
      if (candidatePath === resolvedOutsideLinkPath) {
        return resolvedOutsideTargetPath;
      }
      return candidatePath;
    });
    realPathMock.native = realPathMock;
    fsWithTreeMethods.realpathSync = realPathMock;

    mockDirectoryEntries({
      [ROOT_PATH]: ['outside-link', 'inside-link', 'plain.ts'],
    });

    mockPathStats({
      symlinks: [outsideLinkPath, insideLinkPath],
    });

    const warnMock = jest.fn();
    const result = getDirectoryTree({
      rootPath: ROOT_PATH,
      gitignoreParser,
      onWarn: warnMock,
    });

    expect(result.map((item) => item.name)).toEqual(['plain.ts']);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining(`Skipping symlink outside current root directory: ${outsideLinkPath}`)
    );
  });

  test('prevents recursion loops by tracking canonical directory paths', () => {
    yamlParse.mockReturnValue({ exclude_patterns: [] });

    const firstDirectoryPath = path.join(ROOT_PATH, 'a');
    const secondDirectoryPath = path.join(ROOT_PATH, 'b');
    const sharedCanonicalPath = path.join(ROOT_PATH, 'shared-canonical');
    const resolvedFirstDirectoryPath = path.resolve(firstDirectoryPath);
    const resolvedSecondDirectoryPath = path.resolve(secondDirectoryPath);
    const resolvedSharedCanonicalPath = path.resolve(sharedCanonicalPath);
    const gitignoreParser = createGitignoreParser();

    const realPathMock = jest.fn((candidatePath: string) => {
      if (
        candidatePath === resolvedFirstDirectoryPath ||
        candidatePath === resolvedSecondDirectoryPath
      ) {
        return resolvedSharedCanonicalPath;
      }
      return candidatePath;
    });
    realPathMock.native = realPathMock;
    fsWithTreeMethods.realpathSync = realPathMock;

    mockDirectoryEntries({
      [ROOT_PATH]: ['a', 'b'],
      [firstDirectoryPath]: ['a.ts'],
      [secondDirectoryPath]: ['b.ts'],
    });

    mockPathStats({
      directories: [firstDirectoryPath, secondDirectoryPath],
    });

    const warnMock = jest.fn();
    const result = getDirectoryTree({
      rootPath: ROOT_PATH,
      gitignoreParser,
      onWarn: warnMock,
    });

    expect(result.map((item) => item.name)).toEqual(['a']);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `Skipping previously visited directory to avoid recursion loops: ${secondDirectoryPath}`
      )
    );
  });

  test('falls back on parse errors and keeps traversal resilient', () => {
    yamlParse.mockImplementation(() => {
      throw new Error('parse failure');
    });

    const gitDirectoryPath = path.join(ROOT_PATH, '.git');
    const srcDirectoryPath = path.join(ROOT_PATH, 'src');
    const gitignoreParser = createGitignoreParser(['*.tmp']);

    mockDirectoryEntries({
      [ROOT_PATH]: ['.git', 'src'],
      [gitDirectoryPath]: ['config'],
      [srcDirectoryPath]: ['index.ts'],
    });

    mockPathStats({
      directories: [gitDirectoryPath, srcDirectoryPath],
    });

    const errorMock = jest.fn();
    const result = getDirectoryTree({
      rootPath: ROOT_PATH,
      configContent: 'invalid yaml',
      gitignoreParser,
      onError: errorMock,
    });

    expect(gitignoreParser.parseGitignore).not.toHaveBeenCalled();
    expect(result.map((item) => item.name)).toEqual(['src']);
    expect(errorMock).toHaveBeenCalledWith('Error parsing config:', expect.any(Error));
  });
});
