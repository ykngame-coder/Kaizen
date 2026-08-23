/**
 * Supported UI languages (Master Prompt: multilingual, offline-first — no
 * remote translation service, everything bundled). Pure — no expo-localization
 * or i18next import here, so `pickSupportedLanguage` stays trivially testable.
 */
export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'pt', 'de'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** User's stored language choice — a specific language, or 'auto' to follow the phone. */
export type LanguagePreference = SupportedLanguage | 'auto';

/** Maps a device locale's bare language code to one of our 5 languages, or 'fr' when unsupported/unavailable. */
export function pickSupportedLanguage(deviceLanguageCode: string | null | undefined): SupportedLanguage {
  const code = deviceLanguageCode ?? '';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code) ? (code as SupportedLanguage) : 'fr';
}
