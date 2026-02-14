export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';
export const LOCALE_STORAGE_KEY = 'app.locale';

export const isSupportedLocale = (value: string | null | undefined): value is SupportedLocale => {
  return value !== null && value !== undefined && SUPPORTED_LOCALES.includes(value as SupportedLocale);
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
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE;
  }

  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storedLocale) {
    const normalizedStoredLocale = normalizeLocale(storedLocale);
    if (normalizedStoredLocale) {
      return normalizedStoredLocale;
    }
  }

  const languageCandidates = [
    ...(window.navigator.languages || []),
    window.navigator.language,
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
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
};
