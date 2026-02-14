export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';
export const LOCALE_STORAGE_KEY = 'app.locale';

export const isSupportedLocale = (value: string | null | undefined): value is SupportedLocale => {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as SupportedLocale);
};

const getBrowserWindow = (): Window | undefined => {
  if (globalThis.window === undefined) {
    return undefined;
  }

  return globalThis.window;
};

const normalizeLocale = (value: string): SupportedLocale | null => {
  if (isSupportedLocale(value)) {
    return value;
  }

  const baseLocale = value.split('-')[0];
  if (isSupportedLocale(baseLocale)) {
    return baseLocale;
  }

  return null;
};

export const getInitialLocale = (): SupportedLocale => {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) {
    return DEFAULT_LOCALE;
  }

  const storedLocale = browserWindow.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storedLocale) {
    const normalizedStoredLocale = normalizeLocale(storedLocale);
    if (normalizedStoredLocale) {
      return normalizedStoredLocale;
    }
  }

  const languageCandidates = [
    ...(browserWindow.navigator.languages || []),
    browserWindow.navigator.language,
  ].filter(Boolean);

  for (const candidate of languageCandidates) {
    const normalizedLocale = normalizeLocale(candidate);
    if (normalizedLocale) {
      return normalizedLocale;
    }
  }

  return DEFAULT_LOCALE;
};

export const persistLocale = (locale: SupportedLocale): void => {
  const browserWindow = getBrowserWindow();
  if (!browserWindow) {
    return;
  }

  browserWindow.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
};
