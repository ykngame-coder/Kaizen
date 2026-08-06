import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getProfile, updateProfileAvatar } from '@supotsu/database';
import { secureStorage } from '@/lib/secure-storage';
import { getSupabase } from '@/lib/supabase';
import { readFileBytes } from '@/lib/fileBytes';

/**
 * Profile photo. Authenticated (Supabase) accounts get a real cloud copy —
 * `avatars` storage bucket + `profiles.avatar_url` (migration
 * 0012_profile_avatar.sql) — so it follows the account across devices and
 * reinstalls. Demo mode has no backend to store it in, so it falls back to
 * the device-local functions below (same pattern as progressPhotos.ts).
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

const avatarPath = (userId: string): string => `${userId}/avatar.jpg`;

export async function getCloudAvatarUrl(userId: string): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  const profile = await getProfile(client, userId);
  return profile?.avatar_url ?? null;
}

/** Upload to the `avatars` bucket and record the URL on the profile. Replaces any previous photo. */
export async function uploadAvatarToCloud(userId: string, srcUri: string): Promise<string> {
  const client = getSupabase();
  if (!client) throw new Error('Backend Supabase non configuré.');
  const bytes = await readFileBytes(srcUri);
  const path = avatarPath(userId);
  const { error: uploadError } = await client.storage.from('avatars').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploadError) throw uploadError;
  const { data } = client.storage.from('avatars').getPublicUrl(path);
  // Cache-bust: the path never changes across re-uploads, so force a fresh fetch.
  const url = `${data.publicUrl}?v=${Date.now()}`;
  await updateProfileAvatar(client, userId, url);
  return url;
}

export async function removeCloudAvatar(userId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.storage.from('avatars').remove([avatarPath(userId)]);
  await updateProfileAvatar(client, userId, null);
}
