/**
 * Passe un code-barres scanné du scanner vers l'écran qui l'a ouvert, sans
 * passer par les params de navigation — `router.back()` revient à la même
 * instance d'écran (contrairement à `router.replace`, qui en crée une
 * nouvelle et perdrait tout état local non sauvegardé, ex. une recette en
 * cours de composition). `takePendingBarcode` vide la valeur en la lisant,
 * pour qu'un second passage sur l'écran ne relance pas le même lookup.
 */
let pending: string | null = null;

export function setPendingBarcode(code: string): void {
  pending = code;
}

export function takePendingBarcode(): string | null {
  const code = pending;
  pending = null;
  return code;
}
