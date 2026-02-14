import deCommon from '../../../src/renderer/i18n/locales/de/common.json';
import enCommon from '../../../src/renderer/i18n/locales/en/common.json';
import esCommon from '../../../src/renderer/i18n/locales/es/common.json';
import frCommon from '../../../src/renderer/i18n/locales/fr/common.json';

type JsonRecord = Record<string, unknown>;

const collectLeafKeys = (value: unknown, prefix = ''): string[] => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  const keys = Object.keys(value as JsonRecord);
  if (keys.length === 0) {
    return prefix ? [prefix] : [];
  }

  let result: string[] = [];
  for (const key of keys) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    result = [...result, ...collectLeafKeys((value as JsonRecord)[key], nextPrefix)];
  }

  return result;
};

const getSortedUniqueLeafKeys = (locale: JsonRecord): string[] => {
  return [...new Set(collectLeafKeys(locale))].sort();
};

describe('i18n locale key parity', () => {
  const englishKeys = getSortedUniqueLeafKeys(enCommon as JsonRecord);

  test.each([
    ['es', esCommon],
    ['fr', frCommon],
    ['de', deCommon],
  ])('%s locale has exactly the same keys as en', (localeCode, locale) => {
    const localeKeys = getSortedUniqueLeafKeys(locale as JsonRecord);

    expect(localeKeys).toEqual(englishKeys);
  });
});
