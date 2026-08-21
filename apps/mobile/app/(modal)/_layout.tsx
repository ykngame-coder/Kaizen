import React from 'react';
import { Stack } from 'expo-router';

/**
 * Top-level detail routes reached from any tab (search, dashboard
 * customization) — the root layout is a bare `<Slot/>` with no navigator, so
 * without this Stack these screens got no native swipe-back gesture at all
 * (TestFlight report: no back button, no swipe on the search page).
 */
export default function ModalLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
