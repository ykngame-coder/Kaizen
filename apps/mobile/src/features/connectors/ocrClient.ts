import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

/**
 * Screenshot-import OCR — native (iOS/Android) implementation. Runs
 * entirely on-device via ML Kit; no image or text ever leaves the phone.
 * The web build never bundles this file — see `ocrClient.web.ts`.
 */
export function ocrAvailable(): boolean {
  return true;
}

/** Opens the photo library and returns the picked image's local URI, or null if cancelled. */
export async function pickScreenshot(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Accès aux photos refusé — autorise-le dans les réglages pour importer une capture.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  if (res.canceled || res.assets.length === 0) return null;
  return res.assets[0]!.uri;
}

/** Runs on-device text recognition on an image and returns the raw recognized text. */
export async function ocrImageToText(uri: string): Promise<string> {
  const result = await TextRecognition.recognize(uri);
  return result.text;
}
