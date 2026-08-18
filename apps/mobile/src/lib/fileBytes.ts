import { Platform } from 'react-native';

/** Read a local file (web blob URL, or native file:// / data: URI) as raw bytes. */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  }
  // The modern File API reads bytes natively. The legacy
  // readAsStringAsync(base64) + atob() + manual per-byte loop this replaced
  // froze the app on realistic Garmin-export-sized files (tens of MB): base64
  // inflates the payload ~33%, atob() builds a full binary JS string, then a
  // per-byte loop copies it into a Uint8Array — all synchronous on the JS
  // thread, with no chunking.
  const { File } = await import('expo-file-system');
  return new Uint8Array(await new File(uri).arrayBuffer());
}
