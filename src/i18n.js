import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Import translation files
import translationEN from "./locales/en/translation.json";
import translationHI from "./locales/hi/translation.json";
import translationMR from "./locales/mr/translation.json";

// Create resources object
const resources = {
  en: {
    translation: translationEN,
  },
  hi: {
    translation: translationHI,
  },
  mr: {
    translation: translationMR,
  },
};

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Init i18next
  .init({
    resources,
    fallbackLng: "en", // Default language
    debug: false, // Set to true for development to see logs

    interpolation: {
      escapeValue: false, // React already protects from XSS
    },

    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
