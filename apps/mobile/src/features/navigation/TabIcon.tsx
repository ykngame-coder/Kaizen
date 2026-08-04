import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * Vector icon per hub tab (Accueil, Sport, Sommeil, Nutrition). Profil keeps
 * its existing emoji glyph — only these 4 moved off text glyphs, matching a
 * reference the icons were picked to match closely (dumbbell, bedtime moon,
 * apple, 2×2 grid).
 */
export function TabIcon({
  route,
  color,
  size,
}: {
  route: string;
  color: string;
  size: number;
}): React.JSX.Element {
  switch (route) {
    case 'sport':
      return <MaterialCommunityIcons name="dumbbell" size={size} color={color} />;
    case 'sommeil':
      return <MaterialIcons name="bedtime" size={size} color={color} />;
    case 'nutrition':
      return <MaterialCommunityIcons name="food-apple" size={size} color={color} />;
    case 'index':
    default:
      return <MaterialIcons name="dashboard" size={size} color={color} />;
  }
}
