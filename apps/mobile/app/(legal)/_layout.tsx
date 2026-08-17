import React from 'react';
import { Stack } from 'expo-router';

export default function LegalLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, fullScreenGestureEnabled: true }} />;
}
