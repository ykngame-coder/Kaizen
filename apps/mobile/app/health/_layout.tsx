import React from 'react';
import { Stack } from 'expo-router';

/** Same gap as (modal): no Stack here meant no native swipe-back gesture. */
export default function HealthLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
