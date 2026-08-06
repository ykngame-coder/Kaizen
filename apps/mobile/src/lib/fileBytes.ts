import { Platform } from 'react-native';

/** Read a local file (web blob URL, or native file:// / data: URI) as raw bytes. */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  }
  const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
