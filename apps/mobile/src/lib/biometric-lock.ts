import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

/** True when the device has Face ID/Touch ID (or Android biometrics) set up. */
export async function isBiometricSupported(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}
