import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { secureStorage } from '@/lib/secure-storage';

/**
 * Profile photo, stored locally on the device only (same pattern as
 * progressPhotos.ts) — no Supabase Storage bucket exists in this project yet,
 * so this doesn't sync across devices or survive a reinstall.
 */
const KEY = 'supotsu.profileAvatarUri';

export async function loadAvatarUri(): Promise<string | null> {
  return secureStorage.getItem(KEY);
}

/**
 * Persist a picked/captured image as the profile photo. On native the file is
 * copied into the app's document directory (so it survives cache clears) and
 * only the path is stored; on web the caller passes a data: URL which is
 * stored inline. Replaces any previous photo.
 */
export async function setAvatarUri(srcUri: string): Promise<string> {
  let uri = srcUri;
  if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
    const dir = `${FileSystem.documentDirectory}profile/`;
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      /* already exists */
    }
    const dest = `${dir}avatar-${Date.now()}.jpg`;
    try {
      await FileSystem.copyAsync({ from: srcUri, to: dest });
      uri = dest;
    } catch {
      /* keep the source uri as a fallback */
    }
  }
  const previous = await loadAvatarUri();
  await secureStorage.setItem(KEY, uri);
  if (previous && previous !== uri && Platform.OS !== 'web' && FileSystem.documentDirectory && previous.startsWith(FileSystem.documentDirectory)) {
    try {
      await FileSystem.deleteAsync(previous, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  return uri;
}

export async function clearAvatarUri(): Promise<void> {
  const previous = await loadAvatarUri();
  if (previous && Platform.OS !== 'web' && FileSystem.documentDirectory && previous.startsWith(FileSystem.documentDirectory)) {
    try {
      await FileSystem.deleteAsync(previous, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  await secureStorage.removeItem(KEY);
}
