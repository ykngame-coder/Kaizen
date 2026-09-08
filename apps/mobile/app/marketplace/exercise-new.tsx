import React from 'react';
import { AddCustomExerciseScreen } from '@/features/exercises/AddCustomExerciseScreen';

/**
 * The same screen as `(tabs)/sport/exercise/new`, mounted inside the
 * marketplace group.
 *
 * The root layout renders a `<Slot />`, not a `<Stack>`, so the top-level
 * groups share no history: pushing from the session builder to a route under
 * `(tabs)` swapped the whole group out, unmounted the marketplace stack — the
 * half-built session with it — and left `router.back()` landing on the tabs'
 * initial route, the dashboard. Reported as "l'app quitte la création de séance
 * et nous sommes renvoyés vers le Dashboard [...] il faut recommencer la séance
 * du début". Staying inside this group keeps the builder mounted underneath.
 */
export default function MarketplaceNewExercise(): React.JSX.Element {
  return <AddCustomExerciseScreen />;
}
