/**
 * Screenshot-import OCR — web stub. On-device ML Kit text recognition has no
 * web equivalent, so the import feature is hidden on web (see `ocrAvailable`
 * gating in OcrImportScreen); these functions only exist so the screen's
 * imports resolve without pulling the native ML Kit module into the web bundle.
 */
export function ocrAvailable(): boolean {
  return false;
}

export async function pickScreenshot(): Promise<string | null> {
  throw new Error("L'import par capture d'écran n'est pas disponible sur le web.");
}

export async function ocrImageToText(_uri: string): Promise<string> {
  throw new Error("L'import par capture d'écran n'est pas disponible sur le web.");
}
