#!/usr/bin/env node
// Reads ESLint JSON output from stdin, writes .lint-baseline.json at repo root.
// Usage: npx eslint . --format=json | node scripts/ci/generate-lint-baseline.mjs
//
// Format: { "entries": [ { "file", "rule", "count", "reason" } ] }
// Reasons default to "PRE-FREEZE: to be assigned" and must be updated manually.
// Existing reasons are preserved when regenerating if the old baseline exists.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const outPath = resolve(root, '.lint-baseline.json');

const rawJson = readFileSync(0, 'utf8'); // fd 0 = stdin
const results = JSON.parse(rawJson);

// Preserve existing reasons when regenerating
const existingReasons = {};
if (existsSync(outPath)) {
  try {
    const old = JSON.parse(readFileSync(outPath, 'utf8'));
    for (const entry of (old.entries ?? [])) {
      existingReasons[`${entry.file}::${entry.rule}`] = entry.reason;
    }
  } catch { /* ignore parse errors on malformed baseline */ }
}

const counts = {};
for (const file of results) {
  if (file.messages.length === 0) continue;
  const relPath = relative(root, file.filePath).replace(/\\/g, '/');
  for (const msg of file.messages) {
    const rule = msg.ruleId ?? 'parse-error';
    const key = `${relPath}::${rule}`;
    counts[key] = { file: relPath, rule, count: (counts[key]?.count ?? 0) + 1 };
  }
}

const entries = Object.values(counts)
  .sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule))
  .map(e => ({
    file: e.file,
    rule: e.rule,
    count: e.count,
    reason: existingReasons[`${e.file}::${e.rule}`] ?? 'PRE-FREEZE: to be assigned',
  }));

writeFileSync(outPath, JSON.stringify({ entries }, null, 2) + '\n');
console.error(`Baseline written to .lint-baseline.json: ${entries.length} entries across ${new Set(entries.map(e => e.file)).size} files.`);
