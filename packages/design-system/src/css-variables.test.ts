import { describe, expect, it } from 'vitest';
import { buildThemeCss, cssVarName, themeToCssVars } from './css-variables';
import { darkTheme } from './theme';

describe('css-variables', () => {
  it('converts semantic keys to kebab-case var names', () => {
    expect(cssVarName('background')).toBe('--color-background');
    expect(cssVarName('surfaceElevated')).toBe('--color-surface-elevated');
    expect(cssVarName('onPrimary')).toBe('--color-on-primary');
  });

  it('emits RGB triplets for every semantic color', () => {
    const vars = themeToCssVars(darkTheme);
    // brand[500] = #19d3a2 -> "25 211 162"
    expect(vars['--color-primary']).toBe('25 211 162');
    for (const value of Object.values(vars)) {
      expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });

  it('builds css with light root and dark override', () => {
    const css = buildThemeCss();
    expect(css).toContain(':root {');
    expect(css).toContain('.dark {');
    expect(css).toContain('--color-background');
  });
});
