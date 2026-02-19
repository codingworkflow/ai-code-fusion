export const isAllowedExternalNavigationUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return false;
  }
};

const normalizeFilePathname = (pathname: string): string => {
  const driveLetterMatch = pathname.match(/^\/([A-Za-z]):/);
  if (!driveLetterMatch) {
    return pathname;
  }

  const driveLetter = driveLetterMatch[1].toLowerCase();
  return `/${driveLetter}:${pathname.slice(3)}`;
};

export const isAllowedInAppNavigationUrl = (url: string, rendererIndexUrl: string): boolean => {
  try {
    const targetUrl = new URL(url);
    const rendererUrl = new URL(rendererIndexUrl);

    if (targetUrl.protocol !== 'file:' || rendererUrl.protocol !== 'file:') {
      return false;
    }

    return (
      normalizeFilePathname(targetUrl.pathname) === normalizeFilePathname(rendererUrl.pathname)
    );
  } catch {
    return false;
  }
};
