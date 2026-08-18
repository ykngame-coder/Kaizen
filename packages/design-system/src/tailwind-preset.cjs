/**
 * Shared Tailwind/NativeWind preset. Semantic colors reference CSS variables
 * (see css-variables.ts + the app's global.css) so a single `.dark` class
 * toggles the whole theme. Kept as CJS so tailwind.config.js can require it.
 */

/** rgb(var) helper preserving Tailwind's <alpha-value> opacity modifier. */
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: withVar('--color-background'),
        surface: withVar('--color-surface'),
        'surface-elevated': withVar('--color-surface-elevated'),
        border: withVar('--color-border'),
        text: withVar('--color-text'),
        'text-muted': withVar('--color-text-muted'),
        'text-subtle': withVar('--color-text-subtle'),
        primary: withVar('--color-primary'),
        'on-primary': withVar('--color-on-primary'),
        'on-gradient': withVar('--color-on-gradient'),
        'accent-strength': withVar('--color-accent-strength'),
        'accent-endurance': withVar('--color-accent-endurance'),
        'accent-mobility': withVar('--color-accent-mobility'),
        'accent-recovery': withVar('--color-accent-recovery'),
        success: withVar('--color-success'),
        warning: withVar('--color-warning'),
        error: withVar('--color-error'),
        info: withVar('--color-info'),
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
      },
      fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '18px',
        xl: '22px',
        '2xl': '28px',
        '3xl': '34px',
        '4xl': '44px',
      },
    },
  },
  plugins: [],
};
