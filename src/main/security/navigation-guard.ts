export const isAllowedExternalNavigationUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:';
  } catch {
    return false;
  }
};

const isAboutBlank = (url: string): boolean => url === 'about:blank';

export const isAllowedInAppNavigationUrl = (url: string, rendererIndexUrl: string): boolean => {
  if (isAboutBlank(url)) {
    return true;
  }

  try {
    const targetUrl = new URL(url);
    const rendererUrl = new URL(rendererIndexUrl);

    return targetUrl.protocol === 'file:' && targetUrl.pathname === rendererUrl.pathname;
  } catch {
    return false;
  }
};
