import { describe, expect, it } from 'vitest';
import { pickSupportedLanguage, SUPPORTED_LANGUAGES } from './language';

describe('pickSupportedLanguage', () => {
  it('accepts each supported language code as-is', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(pickSupportedLanguage(lang)).toBe(lang);
    }
  });

  it('falls back to fr for an unsupported code', () => {
    expect(pickSupportedLanguage('ja')).toBe('fr');
    expect(pickSupportedLanguage('zh')).toBe('fr');
  });

  it('falls back to fr for null/undefined (locale unavailable)', () => {
    expect(pickSupportedLanguage(null)).toBe('fr');
    expect(pickSupportedLanguage(undefined)).toBe('fr');
  });

  it('falls back to fr for empty string', () => {
    expect(pickSupportedLanguage('')).toBe('fr');
  });

  it('treats a region-qualified code as unsupported (exact match only)', () => {
    // expo-localization gives a bare languageCode ("pt", not "pt-BR"), so this
    // is a defensive case, not the expected input shape.
    expect(pickSupportedLanguage('en-US')).toBe('fr');
  });
});
