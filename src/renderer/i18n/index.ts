import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import deCommon from './locales/de/common.json';
import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import frCommon from './locales/fr/common.json';
import { DEFAULT_LOCALE, getInitialLocale, SUPPORTED_LOCALES } from './settings';

const resources = {
  en: { common: enCommon },
  es: { common: esCommon },
  fr: { common: frCommon },
  de: { common: deCommon },
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLocale(),
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    ns: ['common'],
    initImmediate: false,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

const i18nInstance = i18n;

export default i18nInstance;
