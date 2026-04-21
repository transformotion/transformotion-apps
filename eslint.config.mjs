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

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/cdk.out/**',
    ],
  },
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
