import React from 'react';
import { Stack } from 'expo-router';

export default function ProfileLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
