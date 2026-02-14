import React from 'react';
import { useTranslation } from 'react-i18next';

import { persistLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/settings';

const LanguageSelector = () => {
  const { i18n, t } = useTranslation();

  const resolvedLanguage = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const selectedLocale = (SUPPORTED_LOCALES.includes(resolvedLanguage as SupportedLocale)
    ? resolvedLanguage
    : 'en') as SupportedLocale;

  const handleLanguageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLocale = event.target.value as SupportedLocale;
    await i18n.changeLanguage(nextLocale);
    persistLocale(nextLocale);
  };

  return (
    <div className='flex items-center'>
      <label htmlFor='language-selector' className='mr-2 text-sm text-gray-600 dark:text-gray-300'>
        {t('languageSelector.label')}
      </label>
      <select
        id='language-selector'
        data-testid='language-selector'
        value={selectedLocale}
        onChange={handleLanguageChange}
        className='rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(`languageSelector.${locale}`)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSelector;
