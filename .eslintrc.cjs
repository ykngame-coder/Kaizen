/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    // Type-aware linting (auto-discovers each file's nearest tsconfig) —
    // needed so `restrict-template-expressions` below can catch objects
    // silently coerced to "[object Object]" in template literals, the way
    // it did on the strength runner (StrengthRunner.tsx:290, Sept 2026).
    projectService: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '.turbo',
    '.expo',
    'coverage',
    'packages/database/src/generated',
    '*.config.js',
    '*.config.cjs',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    // Bloque `${obj}` sur autre chose qu'une string/number/boolean déjà
    // sûre — c'est ce qui a laissé passer "[object Object]" à l'écran sur
    // le runner de musculation.
    '@typescript-eslint/restrict-template-expressions': ['warn', { allowNumber: true, allowBoolean: true, allowNullish: true }],
  },
};
