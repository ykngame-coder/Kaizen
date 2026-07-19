import React from 'react';
import { Redirect } from 'expo-router';

/** Entry point. Onboarding/auth gating lands in Étape 2; for now go to the app. */
export default function Index(): React.JSX.Element {
  return <Redirect href="/(tabs)" />;
}
