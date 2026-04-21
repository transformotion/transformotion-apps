#!/usr/bin/env node
// Reads ESLint JSON output from stdin, writes .lint-baseline.json at repo root.
// Usage: npx eslint . --format=json | node scripts/ci/generate-lint-baseline.mjs

import { readFileSync, writeFileSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const rawJson = readFileSync(0, 'utf8'); // fd 0 = stdin
const results = JSON.parse(rawJson);

const baseline = {};

for (const file of results) {
  if (file.messages.length === 0) continue;
  const relPath = relative(root, file.filePath).replace(/\\/g, '/');
  baseline[relPath] = {};
  for (const msg of file.messages) {
    const rule = msg.ruleId ?? 'parse-error';
    baseline[relPath][rule] = (baseline[relPath][rule] ?? 0) + 1;
  }
}

const outPath = resolve(root, '.lint-baseline.json');
writeFileSync(outPath, JSON.stringify(baseline, null, 2) + '\n');
const fileCount = Object.keys(baseline).length;
const violationCount = Object.values(baseline).reduce(
  (sum, rules) => sum + Object.values(rules).reduce((s, n) => s + n, 0),
  0
);
console.error(`Baseline written to .lint-baseline.json: ${fileCount} files, ${violationCount} total violations.`);
