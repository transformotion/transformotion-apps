#!/usr/bin/env bash
# scripts/ci/check-lint-baseline.sh
#
# Runs ESLint across the workspace and fails if any file has MORE violations
# than the recorded baseline. New files with violations also fail.
#
# Usage: scripts/ci/check-lint-baseline.sh
#
# Exits 0 if violations are ≤ baseline; 1 if any file has grown.

set -uo pipefail

BASELINE=".lint-baseline.json"

if [[ ! -f "$BASELINE" ]]; then
  echo "ERROR: $BASELINE not found. Run:" >&2
  echo "  npx eslint . --format=json | node scripts/ci/generate-lint-baseline.mjs" >&2
  exit 1
fi

echo "Running ESLint across workspace..."
# Allow ESLint exit 1 (violations found) without aborting the script.
eslint_json=$(npx eslint . --format=json 2>/dev/null || true)

echo "Comparing against baseline..."
_ESLINT_JSON="$eslint_json" node --input-type=module << 'EOF'
import { readFileSync } from 'fs';
import { relative } from 'path';

const root = process.cwd();
const results = JSON.parse(process.env._ESLINT_JSON || '[]');
const baseline = JSON.parse(readFileSync('.lint-baseline.json', 'utf8'));

let failed = false;
const newViolations = [];

for (const file of results) {
  if (file.messages.length === 0) continue;
  const relPath = relative(root, file.filePath).replace(/\\/g, '/');
  const fileBaseline = baseline[relPath] ?? {};

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
  const baselineFileCount = Object.keys(baseline).length;
  const cleanFiles = results.filter(r => r.messages.length === 0).length;
  console.log('LINT RATCHET PASSED — no new violations.');
  console.log(`  ${cleanFiles}/${results.length} files clean.`);
  console.log(`  Baseline covers ${baselineFileCount} files with pre-existing violations.`);
}
EOF
