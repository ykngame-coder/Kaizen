import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Minimal Web Storage shape (avoids depending on the DOM lib in tsconfig). */
interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const webStore = (): WebStorage | undefined =>
  (globalThis as { localStorage?: WebStorage }).localStorage;

/**
 * Cross-platform key/value storage for auth tokens and demo state.
 * expo-secure-store has no web implementation, so we fall back to localStorage
 * on web (the app's web build is for development/preview).
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return webStore()?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore()?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      webStore()?.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
