import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Buttons/toggles live deep in the design system, far from the app's
// preferences context — a module-level flag is the simplest way to thread
// the user's "Retour haptique" setting through without wiring a provider
// into every shared component. The app syncs this once on boot and whenever
// the preference changes (see apps/mobile/src/lib/preferences.tsx).
let enabled = true;

export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

/** Light tap feedback for a primary action (buttons, toggles). No-op on web or when disabled. */
export function triggerHaptic(): void {
  if (!enabled || Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
