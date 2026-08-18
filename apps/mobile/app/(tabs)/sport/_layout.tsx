import React from 'react';
import { Stack } from 'expo-router';

export default function SportLayout(): React.JSX.Element {
  // Full-screen gesture (not just the edge) fought vertical scroll on long
  // lists — a swipe with any horizontal component mid-scroll got hijacked as
  // a back-swipe instead (TestFlight report). Edge-only is react-navigation's
  // default for exactly this reason.
  return <Stack screenOptions={{ headerShown: false }} />;
}
