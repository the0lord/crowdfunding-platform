import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';

const resources = {
  en: { translation: en },
  ru: { translation: ru },
};

const languageDetector = {
  type: 'languageDetector',
  async: true,
  init: () => {},
  detect: (callback) => {
    const savedLanguage = localStorage.getItem('language');
    const browserLanguage = navigator.language || navigator.userLanguage;
    
    let detectedLanguage = 'en';
    
    if (savedLanguage) {
      detectedLanguage = savedLanguage;
    } else if (browserLanguage.startsWith('ru')) {
      detectedLanguage = 'ru';
    }
    
    callback(null, detectedLanguage);
  },
};

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });

export default i18n;
