/**
 * Bridges semantic themes to CSS custom properties consumed by the Tailwind
 * preset. Colors are emitted as "R G B" triplets so Tailwind's `<alpha-value>`
 * opacity modifiers keep working (e.g. `bg-primary/20`).
 */

import { themes, type SemanticColors, type ThemeName } from './theme';

function hexToRgbTriplet(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** Maps a SemanticColors key to its CSS variable name (kebab-case). */
export function cssVarName(key: keyof SemanticColors): string {
  return `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
}

/** Ordered list of the semantic keys we expose as variables. */
export const semanticKeys = Object.keys(themes.dark) as (keyof SemanticColors)[];

/** Produces `{ '--color-background': '11 14 19', ... }` for one theme. */
export function themeToCssVars(theme: SemanticColors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of semanticKeys) {
    vars[cssVarName(key)] = hexToRgbTriplet(theme[key]);
  }
  return vars;
}

/** Full CSS string with `:root` (light) and `.dark` overrides. */
export function buildThemeCss(): string {
  const render = (selector: string, name: ThemeName): string => {
    const vars = themeToCssVars(themes[name]);
    const body = Object.entries(vars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    return `${selector} {\n${body}\n}`;
  };
  return [render(':root', 'light'), render('.dark:root', 'dark'), render('.dark', 'dark')].join(
    '\n\n',
  );
}
