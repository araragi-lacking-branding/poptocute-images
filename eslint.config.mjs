// ESLint flat config: the recommended rule set for the Worker source and tests.
// Worker code runs in a service-worker-like runtime (fetch, Request, Response,
// crypto, caches); tests run in Node.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // src/static/app.js is browser code embedded into the page as a string
    ignores: ['src/static/app.js', 'dist/**', '.wrangler/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    // A leading underscore marks a parameter kept for its position in a
    // signature (e.g. scheduled(event, env, _ctx)) but not used
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ['test/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
