// Root ESLint config — enforces cross-app import boundaries across the monorepo.
// Each app's own eslint config can extend this and add app-specific rules.
//
// Rule: apps cannot import from other apps. Shared code lives in packages/.
//   ✅ apps/stock-analyser/ → packages/
//   ✅ apps/budget-tracker/ → packages/
//   ❌ apps/stock-analyser/ → apps/budget-tracker/   (lint error)
//   ❌ apps/budget-tracker/ → apps/stock-analyser/   (lint error)
//   ❌ packages/            → apps/                  (lint error)

'use strict';

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'stock-analyser', pattern: 'apps/stock-analyser/**' },
      { type: 'budget-tracker', pattern: 'apps/budget-tracker/**' },
      { type: 'packages',       pattern: 'packages/**' },
      { type: 'infrastructure', pattern: 'infrastructure/**' },
      { type: 'functions',      pattern: 'functions/**' },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'allow',
      rules: [
        // Apps cannot import from other apps
        {
          from: 'stock-analyser',
          disallow: ['budget-tracker'],
          message: 'Stock Analyser cannot import from Budget Tracker. Move shared code to packages/.',
        },
        {
          from: 'budget-tracker',
          disallow: ['stock-analyser'],
          message: 'Budget Tracker cannot import from Stock Analyser. Move shared code to packages/.',
        },
        // Packages cannot import from apps
        {
          from: 'packages',
          disallow: ['stock-analyser', 'budget-tracker'],
          message: 'Shared packages cannot import from apps. Packages must be app-agnostic.',
        },
      ],
    }],
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'out/',
    'cdk.out/',
    '*.js',   // ignore compiled output; TS source is checked
  ],
};
