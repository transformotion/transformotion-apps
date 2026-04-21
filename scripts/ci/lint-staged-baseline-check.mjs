#!/usr/bin/env node
// scripts/ci/lint-staged-baseline-check.mjs
//
// Pre-commit check: runs ESLint on the staged files passed as
// arguments by lint-staged, compares results against
// .lint-baseline.json, fails on any violation not in the baseline.
//
// Usage: node scripts/ci/lint-staged-baseline-check.mjs <file> [<file> ...]
// lint-staged passes the list of changed files as positional arguments.

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { relative } from 'path';

const files = process.argv.slice(2);
if (files.length === 0) process.exit(0);

const baselinePath = '.lint-baseline.json';
if (!existsSync(baselinePath)) {
  process.stderr.write(`ERROR: ${baselinePath} does not exist\n`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const baselineSet = new Set(
  (baseline.entries ?? []).map(e => `${e.file}|${e.rule}`)
);

// Run ESLint on staged files and capture JSON output.
let eslintJson;
try {
  eslintJson = execSync(
    `npx eslint ${files.map(f => JSON.stringify(f)).join(' ')} --format json`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
} catch (err) {
  // eslint exits non-zero when violations found — that's expected.
  eslintJson = err.stdout ?? '[]';
}

let results;
try {
  results = JSON.parse(eslintJson);
} catch {
  process.stderr.write('ERROR: failed to parse ESLint JSON output\n');
  process.exit(1);
}

const root = process.cwd();
const newViolations = [];

for (const file of results) {
  const relPath = relative(root, file.filePath).replace(/\\/g, '/');
  for (const msg of file.messages) {
    if (!msg.ruleId) continue;
    const key = `${relPath}|${msg.ruleId}`;
    if (!baselineSet.has(key)) {
      newViolations.push({ file: relPath, rule: msg.ruleId, line: msg.line ?? 0 });
    }
  }
}

if (newViolations.length > 0) {
  process.stderr.write('\n');
  process.stderr.write('==============================================================================\n');
  process.stderr.write('PRE-COMMIT FAIL: ESLint found NEW violations in staged files\n');
  process.stderr.write('\n');
  process.stderr.write(`  ${newViolations.length} new violation(s):\n`);
  process.stderr.write('\n');
  for (const v of newViolations) {
    process.stderr.write(`    ${v.file}:${v.line}  [${v.rule}]\n`);
  }
  process.stderr.write('\n');
  process.stderr.write('To fix:\n');
  process.stderr.write('  (a) Preferred: fix the violation in your code.\n');
  process.stderr.write('  (b) Bypass hooks with \'git commit --no-verify\' if you know\n');
  process.stderr.write('      what you\'re doing.\n');
  process.stderr.write('==============================================================================\n');
  process.exit(1);
}

process.exit(0);
