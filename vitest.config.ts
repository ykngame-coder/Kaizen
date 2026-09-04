import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * No vitest config existed before — every test ran on pure Vite defaults.
 * That worked because every existing test file only ever imported via
 * workspace packages (@supotsu/*) or relative paths. sessionBuilder.ts is
 * the first module under test that also imports via the app's own `@/*`
 * TypeScript path alias (apps/mobile/tsconfig.json), which Vite has no way
 * to know about without this. `@` only ever means apps/mobile/src across
 * the whole repo (verified: no other package uses a `@/` import), so this
 * alias is safe to apply globally.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/mobile/src'),
    },
  },
});
