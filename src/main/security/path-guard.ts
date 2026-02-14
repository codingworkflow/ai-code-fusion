import fs from 'fs';
import os from 'node:os';
import path from 'path';

export const resolveRealPath = (inputPath: string): string => {
  const resolvedPath = path.resolve(inputPath);
  const realpathFn = fs.realpathSync?.native ?? fs.realpathSync;

  if (typeof realpathFn === 'function') {
    try {
      const realPathResult = realpathFn(resolvedPath);
      return typeof realPathResult === 'string' && realPathResult.length > 0
        ? realPathResult
        : resolvedPath;
    } catch {
      return resolvedPath;
    }
  }

  return resolvedPath;
};

export const isPathWithinRoot = (rootPath: string, candidatePath: string): boolean => {
  if (!rootPath || !candidatePath) {
    return false;
  }

  const resolvedRootPath = resolveRealPath(rootPath);
  const resolvedCandidatePath = resolveRealPath(candidatePath);
  const relativePath = path.relative(resolvedRootPath, resolvedCandidatePath);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

export const resolveAuthorizedPath = (
  authorizedRootPath: string | null,
  candidatePath: string
): string | null => {
  if (!authorizedRootPath || !candidatePath) {
    return null;
  }

  const resolvedCandidatePath = path.resolve(candidatePath);
  if (!isPathWithinRoot(authorizedRootPath, resolvedCandidatePath)) {
    return null;
  }

  return resolvedCandidatePath;
};

export const isPathWithinTempRoot = (
  candidatePath: string,
  tempRootPath: string = os.tmpdir()
): boolean => {
  if (!candidatePath || !tempRootPath) {
    return false;
  }

  const resolvedTempRootPath = resolveRealPath(tempRootPath);
  const resolvedCandidatePath = resolveRealPath(candidatePath);
  const relativePath = path.relative(resolvedTempRootPath, resolvedCandidatePath);

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};
