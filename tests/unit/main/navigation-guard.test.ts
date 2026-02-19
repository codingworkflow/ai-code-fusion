import { pathToFileURL } from 'node:url';
import path from 'path';

import {
  isAllowedExternalNavigationUrl,
  isAllowedInAppNavigationUrl,
} from '../../../src/main/security/navigation-guard';

describe('navigation-guard', () => {
  const rendererIndexPath = path.resolve('/workspace/mock-app/src/renderer/public/index.html');
  const rendererIndexUrl = pathToFileURL(rendererIndexPath).toString();

  test('allows only http and https external URLs', () => {
    expect(isAllowedExternalNavigationUrl('https://example.com')).toBe(true);
    expect(isAllowedExternalNavigationUrl('http://example.com/docs')).toBe(true);
    expect(isAllowedExternalNavigationUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalNavigationUrl('not-a-url')).toBe(false);
  });

  test('allows renderer index and about:blank for in-app navigation', () => {
    expect(isAllowedInAppNavigationUrl(rendererIndexUrl, rendererIndexUrl)).toBe(true);
    expect(
      isAllowedInAppNavigationUrl(`${rendererIndexUrl}?view=source#details`, rendererIndexUrl)
    ).toBe(true);
    expect(isAllowedInAppNavigationUrl('about:blank', rendererIndexUrl)).toBe(true);
  });

  test('rejects non-index file URLs and external protocols for in-app navigation', () => {
    expect(
      isAllowedInAppNavigationUrl(pathToFileURL('/workspace/mock-app/other.html').toString(), rendererIndexUrl)
    ).toBe(false);
    expect(isAllowedInAppNavigationUrl('https://example.com', rendererIndexUrl)).toBe(false);
    expect(isAllowedInAppNavigationUrl('not-a-url', rendererIndexUrl)).toBe(false);
  });
});
