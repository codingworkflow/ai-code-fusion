import fs from 'fs';
import os from 'node:os';
import path from 'path';

const isWithinResolvedRoot = (resolvedRootPath: string, resolvedCandidatePath: string): boolean => {
  const relativePath = path.relative(resolvedRootPath, resolvedCandidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const resolveFromExistingAncestor = (
  resolvedPath: string,
  realpathFn: (candidate: string) => string
): string => {
  let currentPath = resolvedPath;
  const pendingSegments: string[] = [];

  while (true) {
    try {
      const realCurrentPath = realpathFn(currentPath);
      if (pendingSegments.length > 0) {
        const restoredSegments = [...pendingSegments].reverse();
        return path.join(realCurrentPath, ...restoredSegments);
      }
      return realCurrentPath;
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return resolvedPath;
      }

      pendingSegments.push(path.basename(currentPath));
      currentPath = parentPath;
    }
  }
};

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
      return resolveFromExistingAncestor(resolvedPath, realpathFn);
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
  return isWithinResolvedRoot(resolvedRootPath, resolvedCandidatePath);
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

  return isPathWithinRoot(tempRootPath, candidatePath);
};
