import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from './theme';

type MaterialName = React.ComponentProps<typeof MaterialIcons>['name'];
type CommunityName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Glyph = { family: 'material'; name: MaterialName } | { family: 'community'; name: CommunityName };

const material = (name: MaterialName): Glyph => ({ family: 'material', name });
const community = (name: CommunityName): Glyph => ({ family: 'community', name });

/**
 * Semantic name → vector glyph. Extend this registry as more emoji get
 * migrated (Phase 2); never reference a family's icon name outside this
 * file, so a rename here doesn't hunt through every screen.
 */
const REGISTRY = {
  // Navigation / generic actions
  search: material('search'),
  notifications: material('notifications'),
  settings: material('settings'),
  chat: community('chat-outline'),

  // Profile hub
  target: community('target'),
  devices: community('devices'),
  link: community('link-variant'),
  clipboardCheck: community('clipboard-check-outline'),
  download: community('tray-arrow-down'),
  chartBar: community('chart-bar'),
  calendarCheck: community('calendar-check'),
  peopleGroup: community('account-group'),
  cart: community('cart-outline'),

  // Dashboard
  dumbbell: community('dumbbell'),
  scale: community('scale-bathroom'),
  brain: community('brain'),
  bedtime: material('bedtime'),
  alarm: material('alarm'),
  trendingDown: community('trending-down'),
  trendingUp: community('trending-up'),
  water: community('cup-water'),
  sleep: community('sleep'),
  footsteps: community('shoe-print'),
  medal: community('medal-outline'),
  tune: community('tune'),
  silverware: community('silverware-fork-knife'),
  heartPulse: community('heart-pulse'),
  sparkle: material('auto-awesome'),
  play: material('play-circle-outline'),

  // Sport hub
  armFlex: community('arm-flex'),
  lungs: community('lungs'),
  yoga: community('yoga'),
  calendarClock: community('calendar-clock'),
  fire: community('fire'),
  bookOpen: community('book-open-variant'),
  clipboardText: community('clipboard-text-outline'),
  calendar: community('calendar'),
  trophy: community('trophy-outline'),
  run: material('directions-run'),
  tshirt: community('tshirt-crew-outline'),
  timer: community('timer-outline'),

  // Sommeil hub
  windy: community('weather-windy'),
  puzzle: community('puzzle-outline'),
  emoticonHappy: community('emoticon-happy-outline'),
  headphones: material('headphones'),

  // Nutrition hub
  bowl: community('bowl-mix-outline'),
  noodles: community('noodles'),
  drumstick: community('food-drumstick-outline'),
  apple: community('food-apple-outline'),
  steak: community('food-steak'),

  // Phase 2 — settings, detail, onboarding screens
  checkCircle: community('check-circle-outline'),
  bolt: community('lightning-bolt'),
  fileDocument: community('file-document-outline'),
  warning: material('warning'),
  lock: material('lock-outline'),
  packageBox: community('package-variant-closed'),
  moon: community('weather-night'),
  camera: material('photo-camera'),
  person: material('person-outline'),
  star: material('star-outline'),
  language: material('language'),
  vibrate: community('vibrate'),
  logout: community('logout'),
  infoOutline: material('info-outline'),
  lifebuoy: community('lifebuoy'),
  shieldLock: community('shield-lock-outline'),
  lightbulb: community('lightbulb-on-outline'),
  trash: community('trash-can-outline'),
  pencil: community('pencil-outline'),
} as const;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Defaults to the current theme's `text` color. */
  color?: string;
}

/** A single vector glyph from the shared icon registry (Master Prompt: no ad-hoc emoji icons). */
export function Icon({ name, size = 18, color }: IconProps): React.JSX.Element {
  const { colors } = useTheme();
  const glyph = REGISTRY[name];
  const resolvedColor = color ?? colors.text;
  return glyph.family === 'material' ? (
    <MaterialIcons name={glyph.name} size={size} color={resolvedColor} />
  ) : (
    <MaterialCommunityIcons name={glyph.name} size={size} color={resolvedColor} />
  );
}
