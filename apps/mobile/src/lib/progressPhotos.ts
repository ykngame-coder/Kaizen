import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { secureStorage } from '@/lib/secure-storage';

export interface ProgressPhoto {
  id: string;
  /** file:// URI (native) or data: URL (web). */
  uri: string;
  dateISO: string;
  weightKg?: number;
  note?: string;
}

const KEY = 'supotsu.progressPhotos';

export async function loadPhotos(): Promise<ProgressPhoto[]> {
  const raw = await secureStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as ProgressPhoto[]).sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  } catch {
    return [];
  }
}

async function save(list: ProgressPhoto[]): Promise<void> {
  await secureStorage.setItem(KEY, JSON.stringify(list));
}

/**
 * Persist a picked/captured image. On native the file is copied into the app's
 * document directory (so it survives cache clears) and only the path is stored;
 * on web the caller passes a data: URL which we store inline.
 */
export async function addPhoto(srcUri: string, meta?: { weightKg?: number; note?: string }): Promise<ProgressPhoto[]> {
  const list = await loadPhotos();
  let uri = srcUri;
  if (Platform.OS !== 'web' && FileSystem.documentDirectory) {
    const dir = `${FileSystem.documentDirectory}progress-photos/`;
    try {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {
      /* already exists */
    }
    const dest = `${dir}${Date.now()}.jpg`;
    try {
      await FileSystem.copyAsync({ from: srcUri, to: dest });
      uri = dest;
    } catch {
      /* keep the source uri as a fallback */
    }
  }
  const photo: ProgressPhoto = { id: `${Date.now()}`, uri, dateISO: new Date().toISOString(), weightKg: meta?.weightKg, note: meta?.note };
  const next = [photo, ...list];
  await save(next);
  return next;
}

export async function removePhoto(id: string): Promise<ProgressPhoto[]> {
  const list = await loadPhotos();
  const photo = list.find((p) => p.id === id);
  if (photo && Platform.OS !== 'web' && FileSystem.documentDirectory && photo.uri.startsWith(FileSystem.documentDirectory)) {
    try {
      await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  const next = list.filter((p) => p.id !== id);
  await save(next);
  return next;
}
