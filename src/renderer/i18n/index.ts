import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';

// Get initial language from localStorage or default to 'en'
const getInitialLanguage = (): string => {
  try {
    const stored = localStorage.getItem('claude-code-orchestra-ui');
    if (stored) {
      const parsed = JSON.parse(stored) as { state?: { language?: string } };
      if (parsed.state?.language) {
        return parsed.state.language;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return 'en';
};

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
