// eslint.config.js — flat config (ESLint 9+).
// Rationale (audit R-08): `npm run lint` referenced eslint in package.json
// scripts but neither eslint itself nor any config existed in the repo, so
// it failed with "command not found". This restores real, working linting
// rather than a large `eslint-disable` block.

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target', 'src/core/_archive'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // TypeScript's own noUnusedLocals/noUnusedParameters (tsconfig.json)
      // already enforce this at compile time with a fuller understanding
      // of the type system — avoid the two tools disagreeing.
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
)
