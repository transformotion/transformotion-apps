#!/usr/bin/env node
// Called by check-lint-baseline.sh.
// Usage: node scripts/ci/check-lint-violations.mjs <eslint-json-file> <baseline-json-file>

import { readFileSync } from 'fs';
import { relative } from 'path';

const [, , eslintFile, baselineFile] = process.argv;
const root = process.cwd();
const results = JSON.parse(readFileSync(eslintFile, 'utf8'));
const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));

// Build a per-file per-rule count lookup from entries array
const baselineCounts = {};
for (const entry of (baseline.entries ?? [])) {
  if (!baselineCounts[entry.file]) baselineCounts[entry.file] = {};
  baselineCounts[entry.file][entry.rule] = entry.count;
}

let failed = false;
const newViolations = [];

for (const file of results) {
  if (file.messages.length === 0) continue;
  const relPath = relative(root, file.filePath).replace(/\\/g, '/');
  const fileBaseline = baselineCounts[relPath] ?? {};

  const current = {};
  for (const msg of file.messages) {
    const rule = msg.ruleId ?? 'parse-error';
    current[rule] = (current[rule] ?? 0) + 1;
  }

  for (const [rule, count] of Object.entries(current)) {
    const baselineCount = fileBaseline[rule] ?? 0;
    if (count > baselineCount) {
      newViolations.push({ file: relPath, rule, count, baseline: baselineCount });
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nLINT RATCHET FAILED — new violations introduced:\n');
  for (const v of newViolations) {
    console.error(`  ${v.file}`);
    console.error(`    rule: ${v.rule}  current: ${v.count}  baseline: ${v.baseline}`);
  }
  console.error('\nFix the violations, or update the baseline with:');
  console.error('  npx eslint . --format=json | node scripts/ci/generate-lint-baseline.mjs');
  process.exit(1);
} else {
  const baselineEntryCount = (baseline.entries ?? []).length;
  const cleanFiles = results.filter(r => r.messages.length === 0).length;
  console.log('LINT RATCHET PASSED — no new violations.');
  console.log(`  ${cleanFiles}/${results.length} files clean.`);
  console.log(`  Baseline covers ${baselineEntryCount} entries.`);
}
