import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.cache/**'] },
  js.configs.recommended,
  {
    files: ['**/*.cjs', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/translations.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
];
