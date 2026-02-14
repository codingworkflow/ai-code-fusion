export const normalizePathForBoundaryCheck = (inputPath: string): string => {
  const normalizedSlashes = inputPath.replaceAll('\\', '/');
  const driveMatch = /^[A-Za-z]:/.exec(normalizedSlashes);
  const drivePrefix = driveMatch ? driveMatch[0].toLowerCase() : '';
  const pathWithoutDrive = drivePrefix ? normalizedSlashes.slice(2) : normalizedSlashes;
  const hasLeadingSlash = pathWithoutDrive.startsWith('/');

  const segments = pathWithoutDrive.split('/').filter((segment) => segment && segment !== '.');
  const resolvedSegments: string[] = [];

  for (const segment of segments) {
    if (segment === '..') {
      if (resolvedSegments.length > 0 && resolvedSegments.at(-1) !== '..') {
        resolvedSegments.pop();
      } else if (!hasLeadingSlash) {
        resolvedSegments.push('..');
      }
      continue;
    }

    resolvedSegments.push(segment);
  }

  return `${drivePrefix}${hasLeadingSlash ? '/' : ''}${resolvedSegments.join('/')}`;
};

export const isPathWithinRootBoundary = (candidatePath: string, rootPath: string): boolean => {
  if (!candidatePath || !rootPath) {
    return false;
  }

  const normalizedRootPath = normalizePathForBoundaryCheck(rootPath);
  const normalizedCandidatePath = normalizePathForBoundaryCheck(candidatePath);

  return (
    normalizedCandidatePath === normalizedRootPath ||
    normalizedCandidatePath.startsWith(`${normalizedRootPath}/`)
  );
};
