// Root ESLint flat config — enforces cross-app import boundaries.
//
// Rule: apps cannot import from other apps. Shared code lives in packages/.
//   ✅ apps/*/          → packages/
//   ❌ apps/stock-analyser/ → apps/budget-tracker/  (lint error)
//   ❌ apps/budget-tracker/ → apps/stock-analyser/  (lint error)
//   ❌ apps/web/        → apps/stock-analyser/      (lint error)
//   ❌ packages/        → apps/                     (lint error)
//   ❌ infrastructure/  → apps/                     (lint error)

import boundaries from 'eslint-plugin-boundaries';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/cdk.out/**',
      'apps/web-vite-backup/**',
      'v0-reference/**',
    ],
  },

  // TypeScript recommended rules (scoped to ts/tsx by flat/recommended)
  ...tsPlugin.configs['flat/recommended'],

  {
    files: ['**/*.ts', '**/*.tsx'],
    // Noise-reduction overrides on top of flat/recommended
    rules: {
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-namespace': 'off',
    },
  },

  // React hooks rules (targeted — skip react-hooks v7 compiler rules)
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Import boundary rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { boundaries },
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
        },
      },
      'boundaries/elements': [
        { type: 'web',            pattern: 'apps/web/**' },
        { type: 'stock-analyser', pattern: 'apps/stock-analyser/**' },
        { type: 'budget-tracker', pattern: 'apps/budget-tracker/**' },
        { type: 'packages',       pattern: 'packages/**' },
        { type: 'infrastructure', pattern: 'infrastructure/**' },
        { type: 'functions',      pattern: 'functions/**' },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'allow',
        rules: [
          {
            from: { type: 'web' },
            disallow: { to: { type: ['stock-analyser', 'budget-tracker'] } },
          },
          {
            from: { type: 'stock-analyser' },
            disallow: { to: { type: ['web', 'budget-tracker'] } },
          },
          {
            from: { type: 'budget-tracker' },
            disallow: { to: { type: ['web', 'stock-analyser'] } },
          },
          {
            from: { type: 'packages' },
            disallow: { to: { type: ['web', 'stock-analyser', 'budget-tracker'] } },
          },
          {
            from: { type: 'infrastructure' },
            disallow: { to: { type: ['web', 'stock-analyser', 'budget-tracker'] } },
          },
        ],
      }],
    },
  },
];
