/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset'), require('@supotsu/design-system/tailwind-preset')],
  theme: { extend: {} },
  plugins: [],
};
