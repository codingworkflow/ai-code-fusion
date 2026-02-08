import { Minimatch } from 'minimatch';

export const fnmatch = (filepath: unknown, pattern: unknown): boolean => {
  if (typeof filepath !== 'string' || typeof pattern !== 'string') {
    return false;
  }

  try {
    const mm = new Minimatch(pattern, {
      dot: true,
      matchBase: true,
      nocomment: true,
      nobrace: false,
      noext: false,
    });

    return mm.match(filepath);
  } catch (error) {
    console.error(`Error matching pattern ${pattern} against ${filepath}:`, error);
    return false;
  }
};

const fnmatchApi = { fnmatch };

export default fnmatchApi;
