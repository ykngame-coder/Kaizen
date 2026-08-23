import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { pickSupportedLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './language';
import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import de from './locales/de.json';

export { SUPPORTED_LANGUAGES, pickSupportedLanguage };
export type { LanguagePreference, SupportedLanguage } from './language';

/** The phone's language, mapped to one of our 5 supported languages ('fr' if unavailable/unsupported). */
export function detectDeviceLanguage(): SupportedLanguage {
  return pickSupportedLanguage(Localization.getLocales()[0]?.languageCode);
}

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
  de: { translation: de },
};

/**
 * Offline-first i18n (Master Prompt: multilingual, no remote translation
 * calls — every locale is bundled). Starts on the phone's language;
 * PreferencesProvider switches it once the persisted user choice loads (see
 * apps/mobile/src/lib/preferences.tsx).
 */
// No backend/remote loading is used — every resource is bundled and already
// in memory, so init() resolves synchronously in practice; no first-frame
// flash of untranslated keys to guard against.
void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
