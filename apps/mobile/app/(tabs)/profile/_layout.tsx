import React from 'react';
import { Stack } from 'expo-router';

export default function ProfileLayout(): React.JSX.Element {
  // See sport/_layout.tsx — full-screen gesture fights vertical scroll on
  // long lists, reverted to react-navigation's edge-only default.
  return <Stack screenOptions={{ headerShown: false }} />;
}
