import React from 'react';
import { Stack } from 'expo-router';

/**
 * Same gap as (modal): this cluster lives directly under app/, outside any
 * Stack navigator, so it had no native swipe-back gesture until this layout
 * was added.
 */
export default function MarketplaceLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
