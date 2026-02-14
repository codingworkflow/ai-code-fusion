import fs from 'fs';
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

const fsWithTreeMethods = fs as unknown as FsWithTreeMethods;
const yamlParse = yaml.parse as jest.Mock;

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

    const gitignoreParser = {
      parseGitignore: jest.fn().mockReturnValue({
        excludePatterns: ['*.log'],
        includePatterns: ['keep.log'],
      }),
    };

    fsWithTreeMethods.readdirSync.mockImplementation((directoryPath: string) => {
      if (directoryPath === '/mock/repo') {
        return ['src', 'node_modules', 'keep.log', 'drop.log', 'README.md'];
      }
      if (directoryPath === '/mock/repo/src') {
        return ['index.ts', 'helper.js'];
      }
      return [];
    });

    const isDirectoryPath = (candidatePath: string): boolean =>
      candidatePath.endsWith('/src') || candidatePath.endsWith('/node_modules');

    fsWithTreeMethods.lstatSync?.mockImplementation((candidatePath: string) =>
      buildMockStats({ isDirectory: isDirectoryPath(candidatePath) })
    );
    fsWithTreeMethods.statSync.mockImplementation((candidatePath: string) =>
      buildMockStats({ isDirectory: isDirectoryPath(candidatePath) })
    );

    const result = getDirectoryTree({
      rootPath: '/mock/repo',
      configContent: 'mocked: true',
      gitignoreParser,
    });

    expect(gitignoreParser.parseGitignore).toHaveBeenCalledWith('/mock/repo');
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

    const gitignoreParser = {
      parseGitignore: jest.fn().mockReturnValue({
        excludePatterns: [],
        includePatterns: [],
      }),
    };

    const realPathMock = jest.fn((candidatePath: string) => {
      if (candidatePath === '/mock/repo/outside-link') {
        return '/outside/root/target';
      }
      return candidatePath;
    });
    realPathMock.native = realPathMock;
    fsWithTreeMethods.realpathSync = realPathMock;

    fsWithTreeMethods.readdirSync.mockImplementation((directoryPath: string) => {
      if (directoryPath === '/mock/repo') {
        return ['outside-link', 'inside-link', 'plain.ts'];
      }
      return [];
    });

    fsWithTreeMethods.lstatSync?.mockImplementation((candidatePath: string) =>
      buildMockStats({
        isSymbolicLink: candidatePath.endsWith('outside-link') || candidatePath.endsWith('inside-link'),
      })
    );
    fsWithTreeMethods.statSync.mockImplementation(() => buildMockStats());

    const warnMock = jest.fn();
    const result = getDirectoryTree({
      rootPath: '/mock/repo',
      gitignoreParser,
      onWarn: warnMock,
    });

    expect(result.map((item) => item.name)).toEqual(['plain.ts']);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining('Skipping symlink outside current root directory: /mock/repo/outside-link')
    );
  });

  test('prevents recursion loops by tracking canonical directory paths', () => {
    yamlParse.mockReturnValue({ exclude_patterns: [] });

    const gitignoreParser = {
      parseGitignore: jest.fn().mockReturnValue({
        excludePatterns: [],
        includePatterns: [],
      }),
    };

    const realPathMock = jest.fn((candidatePath: string) => {
      if (candidatePath === '/mock/repo/a' || candidatePath === '/mock/repo/b') {
        return '/mock/repo/shared-canonical';
      }
      return candidatePath;
    });
    realPathMock.native = realPathMock;
    fsWithTreeMethods.realpathSync = realPathMock;

    fsWithTreeMethods.readdirSync.mockImplementation((directoryPath: string) => {
      if (directoryPath === '/mock/repo') {
        return ['a', 'b'];
      }
      if (directoryPath === '/mock/repo/a') {
        return ['a.ts'];
      }
      if (directoryPath === '/mock/repo/b') {
        return ['b.ts'];
      }
      return [];
    });

    fsWithTreeMethods.lstatSync?.mockImplementation((candidatePath: string) =>
      buildMockStats({
        isDirectory: candidatePath.endsWith('/a') || candidatePath.endsWith('/b'),
      })
    );
    fsWithTreeMethods.statSync.mockImplementation((candidatePath: string) =>
      buildMockStats({
        isDirectory: candidatePath.endsWith('/a') || candidatePath.endsWith('/b'),
      })
    );

    const warnMock = jest.fn();
    const result = getDirectoryTree({
      rootPath: '/mock/repo',
      gitignoreParser,
      onWarn: warnMock,
    });

    expect(result.map((item) => item.name)).toEqual(['a']);
    expect(warnMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipping previously visited directory to avoid recursion loops: /mock/repo/b'
      )
    );
  });

  test('falls back on parse errors and keeps traversal resilient', () => {
    yamlParse.mockImplementation(() => {
      throw new Error('parse failure');
    });

    const gitignoreParser = {
      parseGitignore: jest.fn().mockReturnValue({
        excludePatterns: ['*.tmp'],
        includePatterns: [],
      }),
    };

    fsWithTreeMethods.readdirSync.mockImplementation((directoryPath: string) => {
      if (directoryPath === '/mock/repo') {
        return ['.git', 'src'];
      }
      if (directoryPath === '/mock/repo/.git') {
        return ['config'];
      }
      if (directoryPath === '/mock/repo/src') {
        return ['index.ts'];
      }
      return [];
    });

    fsWithTreeMethods.lstatSync?.mockImplementation((candidatePath: string) =>
      buildMockStats({
        isDirectory: candidatePath.endsWith('/.git') || candidatePath.endsWith('/src'),
      })
    );
    fsWithTreeMethods.statSync.mockImplementation((candidatePath: string) =>
      buildMockStats({
        isDirectory: candidatePath.endsWith('/.git') || candidatePath.endsWith('/src'),
      })
    );

    const errorMock = jest.fn();
    const result = getDirectoryTree({
      rootPath: '/mock/repo',
      configContent: 'invalid yaml',
      gitignoreParser,
      onError: errorMock,
    });

    expect(gitignoreParser.parseGitignore).not.toHaveBeenCalled();
    expect(result.map((item) => item.name)).toEqual(['src']);
    expect(errorMock).toHaveBeenCalledWith('Error parsing config:', expect.any(Error));
  });
});
