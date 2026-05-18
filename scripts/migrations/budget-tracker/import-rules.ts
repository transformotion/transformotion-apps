import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Configuration ──────────────────────────────────────────────────────────────
const DRY_RUN = true; // Set to false to write rules to DynamoDB

const ACCOUNT_ID         = 'aed9dcdf-81b5-47a1-a0d5-5afbae940e93';
const API_BASE           = 'https://yqtrjzrnp3.execute-api.ap-southeast-2.amazonaws.com/dev';
const RULES_ENDPOINT     = `${API_BASE}/api/budget/v1/rules`;
const BUDGET_DATA_TABLE  = 'budget-tracker.budget-data-dev';
const TRANSACTIONS_TABLE = 'budget-tracker.transactions-dev';
const RULES_TABLE        = 'budget-tracker.rules-dev';

const EXPORT_FILE = path.resolve(__dirname, '../../../migration-artifacts/budget-tracker/matching-rules/exports/export.json');

// ── Label aliases (export label → DynamoDB category name) ─────────────────────
const LABEL_ALIASES: Record<string, string> = {
  'Movies, shows & music': 'Movies shows & music',
};

// ── Match overrides (1-based rule index → replacement match string) ────────────
// Rule 30 original pattern 'ANZ INTERNET BANKING' is too broad — it matches
// child-support payments like 'ANZ INTERNET BANKING PAYMENT ... TO ELLA MOODIE'.
// The only transaction correctly caught by this rule is the BPAY rego renewal.
const MATCH_OVERRIDES: Record<number, string> = {
  30: 'BPAY TMR REG RENEW',
};

// ── DynamoDB client ────────────────────────────────────────────────────────────
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));

// ── Types ──────────────────────────────────────────────────────────────────────
interface ExportRule {
  match: string;
  category: string;
  subcategory: string;
  learned: boolean;
}

interface DdbSubcategory {
  subcategoryId: string;
  name: string;
  excludeFromCashflow?: boolean;
  deleted?: boolean;
}

interface DdbCategory {
  categoryId: string;
  name: string;
  type: string;
  subcategories: DdbSubcategory[];
}

interface ResolvedRule {
  index: number;
  originalMatch: string;
  match: string;         // converted (bare * → .*)
  matchType: 'regex' | 'contains';
  categoryId: string;
  subcategoryId: string;
  categoryName: string;
  subcategoryName: string;
  learned: boolean;
  notes: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(matchType: string, pattern: string): RegExp {
  if (matchType === 'regex') return new RegExp(pattern, 'i');
  return new RegExp(escapeRegex(pattern), 'i'); // contains
}

// Detection: bare * = * not preceded by .
const BARE_WILDCARD_RE = /(?<!\.)\*/;
// Regex chars that indicate this is a regex pattern
const REGEX_INDICATOR_RE = /[|([\\\+\?^$]|\.\*/;

function detectMatchType(match: string): { matchType: 'regex' | 'contains'; convertedMatch: string; notes: string[] } {
  const notes: string[] = [];
  const hasBareWildcard = BARE_WILDCARD_RE.test(match);
  const hasRegexChars   = REGEX_INDICATOR_RE.test(match);

  if (hasBareWildcard || hasRegexChars) {
    let convertedMatch = match;
    if (hasBareWildcard) {
      convertedMatch = match.replace(BARE_WILDCARD_RE, '.*');
      notes.push(`bare * → .*  ('${match}' → '${convertedMatch}')`);
    }
    return { matchType: 'regex', convertedMatch, notes };
  }
  return { matchType: 'contains', convertedMatch: match, notes: [] };
}

// ── DynamoDB helpers ───────────────────────────────────────────────────────────
async function fetchCategories(): Promise<DdbCategory[]> {
  const res = await ddb.send(new GetCommand({
    TableName: BUDGET_DATA_TABLE,
    Key: { accountId: ACCOUNT_ID, concept: 'categories' },
  }));
  if (!res.Item) throw new Error('Categories not found in DynamoDB');
  return res.Item.value as DdbCategory[];
}

async function fetchAllTransactions(): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TRANSACTIONS_TABLE,
      KeyConditionExpression: 'accountId = :aid',
      ExpressionAttributeValues: { ':aid': ACCOUNT_ID },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((res.Items ?? []) as Record<string, unknown>[]));
    lastKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);
  return items;
}

async function fetchRulesCount(): Promise<number> {
  const res = await ddb.send(new ScanCommand({
    TableName: RULES_TABLE,
    FilterExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': ACCOUNT_ID },
    Select: 'COUNT',
  }));
  return res.Count ?? 0;
}

// ── Label resolution ───────────────────────────────────────────────────────────
function resolveLabels(
  categories: DdbCategory[],
  categoryLabel: string,
  subcategoryLabel: string,
): { categoryId: string; subcategoryId: string; categoryName: string; subcategoryName: string } | null {
  // Special case: _ignore → Financial & Insurance > Excluded Transactions
  if (categoryLabel === '_ignore') {
    const cat = categories.find(c => c.name === 'Financial & Insurance');
    if (!cat) return null;
    const sub = cat.subcategories.find(s => s.name === 'Excluded Transactions' && !s.deleted);
    if (!sub) return null;
    return { categoryId: cat.categoryId, subcategoryId: sub.subcategoryId, categoryName: cat.name, subcategoryName: sub.name };
  }

  const resolvedSubLabel = LABEL_ALIASES[subcategoryLabel] ?? subcategoryLabel;
  const cat = categories.find(c => c.name === categoryLabel);
  if (!cat) return null;
  const sub = cat.subcategories.find(s => s.name === resolvedSubLabel && !s.deleted);
  if (!sub) return null;
  return { categoryId: cat.categoryId, subcategoryId: sub.subcategoryId, categoryName: cat.name, subcategoryName: sub.name };
}

// Also resolves old string-format transactions to UUIDs for comparison
function resolveStringLabels(
  categories: DdbCategory[],
  catName: string,
  subName: string,
): { categoryId: string; subcategoryId: string } | null {
  const resolvedSub = LABEL_ALIASES[subName] ?? subName;
  const cat = categories.find(c => c.name === catName);
  if (!cat) return null;
  const sub = cat.subcategories.find(s => s.name === resolvedSub && !s.deleted);
  if (!sub) return null;
  return { categoryId: cat.categoryId, subcategoryId: sub.subcategoryId };
}

// ── Conflict detection ─────────────────────────────────────────────────────────
interface Conflict {
  ruleA: ResolvedRule;
  ruleB: ResolvedRule;
  trigger: string;
}

function extractTestStrings(matchType: string, match: string): string[] {
  if (matchType === 'regex') {
    // Split on top-level | to get candidate literal branches
    return match.split('|').map(s => s.trim()).filter(s => s && !s.startsWith('(?') && !s.startsWith('^'));
  }
  return [match];
}

function detectConflicts(rules: ResolvedRule[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (a.subcategoryId === b.subcategoryId) continue; // same destination — not a conflict

      let trigger: string | null = null;

      // Test strings from A against B's pattern
      for (const ts of extractTestStrings(a.matchType, a.match)) {
        try { if (buildRegex(b.matchType, b.match).test(ts)) { trigger = ts; break; } } catch {}
      }
      // Test strings from B against A's pattern
      if (!trigger) {
        for (const ts of extractTestStrings(b.matchType, b.match)) {
          try { if (buildRegex(a.matchType, a.match).test(ts)) { trigger = ts; break; } } catch {}
        }
      }

      if (trigger) conflicts.push({ ruleA: a, ruleB: b, trigger });
    }
  }
  return conflicts;
}

// ── Local applyRules simulation ────────────────────────────────────────────────
// All rules have priority 100. Tiebreaker: index DESC (higher index = inserted later = newer
// createdAt = wins in canonical createdAt DESC sort).
function applyRulesLocal(description: string, rules: ResolvedRule[]): ResolvedRule | null {
  const sorted = [...rules].sort((a, b) => b.index - a.index); // higher index wins ties
  for (const rule of sorted) {
    try {
      if (buildRegex(rule.matchType, rule.match).test(description)) return rule;
    } catch {}
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const HR = '─'.repeat(60);
  const HR2 = '═'.repeat(60);

  console.log('Budget Tracker — Rules Import');
  console.log('==============================');
  console.log(DRY_RUN
    ? '▸ MODE: DRY-RUN (no changes will be made)\n'
    : '▸ MODE: EXECUTE — rules will be written to DynamoDB\n');

  // Load export
  if (!fs.existsSync(EXPORT_FILE)) {
    console.error(`Export file not found: ${EXPORT_FILE}`); process.exit(1);
  }
  const exportRules = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf-8')) as ExportRule[];
  console.log(`Loaded ${exportRules.length} rules from export\n`);

  // Token
  console.log('To get your Cognito ID token:');
  console.log('  1. Sign in to https://dev.apps.transformotion.com.au/budget-tracker/');
  console.log('  2. DevTools → Application → Local Storage → entry ending in `.idToken`\n');
  const idToken = await prompt('Paste Cognito ID token: ');
  if (!idToken || !idToken.startsWith('eyJ')) {
    console.error('Invalid token.'); process.exit(1);
  }
  console.log('');

  // Fetch categories
  process.stdout.write('Fetching categories tree from DynamoDB... ');
  const categories = await fetchCategories();
  console.log(`${categories.length} categories loaded\n`);

  // ── SECTION 1: Rule resolution ─────────────────────────────────────────────
  console.log(HR);
  console.log('SECTION 1: Rule resolution');
  console.log(HR);
  console.log('');

  const resolvedRules: ResolvedRule[] = [];
  const unresolvable: { index: number; match: string; category: string; subcategory: string }[] = [];
  let aliasCount = 0, ignoreCount = 0, conversionCount = 0, regexCount = 0, containsCount = 0;

  for (let i = 0; i < exportRules.length; i++) {
    const r = exportRules[i];
    const notes: string[] = [];

    const ruleIndex = i + 1;
    const originalMatchForDetection = MATCH_OVERRIDES[ruleIndex] ?? r.match;
    if (MATCH_OVERRIDES[ruleIndex]) {
      notes.push(`MATCH_OVERRIDE: '${r.match}' → '${MATCH_OVERRIDES[ruleIndex]}'`);
    }

    const { matchType, convertedMatch, notes: detNotes } = detectMatchType(originalMatchForDetection);
    notes.push(...detNotes);
    if (detNotes.length) conversionCount++;
    if (matchType === 'regex') regexCount++; else containsCount++;

    const isIgnore = r.category === '_ignore';
    if (isIgnore) { notes.push('_ignore → Financial & Insurance / Excluded Transactions'); ignoreCount++; }

    const isAlias = !isIgnore && LABEL_ALIASES[r.subcategory] !== undefined;
    if (isAlias) { notes.push(`LABEL_ALIAS: '${r.subcategory}' → '${LABEL_ALIASES[r.subcategory]}'`); aliasCount++; }

    const resolved = resolveLabels(categories, r.category, r.subcategory);
    if (!resolved) {
      unresolvable.push({ index: i + 1, match: r.match, category: r.category, subcategory: r.subcategory });
      console.log(`  Rule ${String(i + 1).padStart(2)}: ✗ UNRESOLVABLE  match='${r.match}'  category='${r.category}'  subcategory='${r.subcategory}'`);
      continue;
    }

    resolvedRules.push({
      index: i + 1,
      originalMatch: r.match,
      match: convertedMatch,
      matchType,
      categoryId:      resolved.categoryId,
      subcategoryId:   resolved.subcategoryId,
      categoryName:    resolved.categoryName,
      subcategoryName: resolved.subcategoryName,
      learned: r.learned,
      notes,
    });

    const noteStr = notes.length ? `  [${notes.join('; ')}]` : '';
    console.log(`  Rule ${String(i + 1).padStart(2)}: '${r.match.slice(0, 35).padEnd(35)}' → ${matchType.padEnd(8)} → ${resolved.categoryName} / ${resolved.subcategoryName}${noteStr}`);
  }

  console.log('');
  if (unresolvable.length > 0) {
    console.log(`✗ ${unresolvable.length} rule(s) unresolvable — cannot proceed`);
    process.exit(1);
  }
  console.log(`✓ All ${resolvedRules.length} rules resolved successfully`);

  // ── SECTION 2: matchType summary ───────────────────────────────────────────
  console.log('\n' + HR);
  console.log('SECTION 2: matchType detection summary');
  console.log(HR);
  console.log(`  Total:            ${exportRules.length}`);
  console.log(`  regex:            ${regexCount} (${conversionCount} with bare * → .* conversion)`);
  console.log(`  contains:         ${containsCount}`);
  console.log(`  LABEL_ALIAS:      ${aliasCount} rules`);
  console.log(`  _ignore special:  ${ignoreCount} rule (Hawkins → Excluded Transactions)`);

  // ── SECTION 3: Conflict detection ─────────────────────────────────────────
  console.log('\n' + HR);
  console.log('SECTION 3: Conflict detection');
  console.log(HR);

  const conflicts = detectConflicts(resolvedRules);
  if (conflicts.length === 0) {
    console.log('  No conflicts detected.');
  } else {
    console.log(`  ${conflicts.length} potential conflict(s):\n`);
    for (const c of conflicts) {
      // Higher index = inserted later = newer createdAt = wins in createdAt DESC sort
      const winner = c.ruleA.index > c.ruleB.index ? c.ruleA : c.ruleB;
      console.log(`  CONFLICT: Rule ${c.ruleA.index} vs Rule ${c.ruleB.index}  (trigger: '${c.trigger}')`);
      console.log(`    Rule ${String(c.ruleA.index).padStart(2)}: match='${c.ruleA.match}'  → ${c.ruleA.categoryName} / ${c.ruleA.subcategoryName}`);
      console.log(`    Rule ${String(c.ruleB.index).padStart(2)}: match='${c.ruleB.match}'  → ${c.ruleB.categoryName} / ${c.ruleB.subcategoryName}`);
      console.log(`    Tiebreaker: Rule ${winner.index} (higher index = newer createdAt) WINS → ${winner.categoryName} / ${winner.subcategoryName}`);
      console.log(`    To override: assign lower priority number to the preferred rule before execute`);
      console.log('');
    }
  }

  // ── SECTION 4: Rules-vs-transactions diff ─────────────────────────────────
  console.log(HR);
  console.log('SECTION 4: Rules-vs-transactions diff');
  console.log(HR);

  process.stdout.write('  Fetching transactions from DynamoDB... ');
  const transactions = await fetchAllTransactions();
  console.log(`${transactions.length} loaded\n`);

  // Build lookup sets
  const excludedSubIds = new Set<string>();
  const catIdToName    = new Map<string, string>();
  const subIdToName    = new Map<string, string>();
  for (const cat of categories) {
    catIdToName.set(cat.categoryId, cat.name);
    for (const sub of cat.subcategories) {
      subIdToName.set(sub.subcategoryId, sub.name);
      if (sub.excludeFromCashflow) excludedSubIds.add(sub.subcategoryId);
    }
  }

  interface Discrepancy {
    date: string; description: string;
    currentCat: string; currentSub: string;
    wouldBeCat: string; wouldBeSub: string;
  }

  let matchCount = 0, discrepancyCount = 0, noMatchCount = 0, skippedCount = 0;
  const discrepancies: Discrepancy[] = [];

  for (const tx of transactions) {
    if (tx['_manual']) { skippedCount++; continue; }

    // Resolve current categoryId/subcategoryId — handle both UUID and legacy string forms
    let curCatId  = tx['categoryId']  as string | undefined;
    let curSubId  = tx['subcategoryId'] as string | undefined;

    if (!curCatId && tx['category']) {
      const res = resolveStringLabels(categories, tx['category'] as string, (tx['subcategory'] as string) || '');
      if (res) { curCatId = res.categoryId; curSubId = res.subcategoryId; }
    }

    if (!curCatId) { skippedCount++; continue; } // uncategorised — no current state to compare

    // Skip excluded-from-cashflow subcategories (system-managed)
    if (curSubId && excludedSubIds.has(curSubId)) { skippedCount++; continue; }

    const result = applyRulesLocal((tx['description'] as string) || '', resolvedRules);

    if (!result) {
      noMatchCount++;
    } else if (result.categoryId === curCatId && result.subcategoryId === curSubId) {
      matchCount++;
    } else {
      discrepancyCount++;
      discrepancies.push({
        date:        (tx['date'] as string) || (tx['dateIso'] as string) || '',
        description: (tx['description'] as string) || '',
        currentCat:  catIdToName.get(curCatId)  || (tx['category']    as string) || curCatId,
        currentSub:  subIdToName.get(curSubId!)  || (tx['subcategory'] as string) || curSubId || '—',
        wouldBeCat:  result.categoryName,
        wouldBeSub:  result.subcategoryName,
      });
    }
  }

  const total = transactions.length;
  console.log(`  Results (${total} transactions):`);
  console.log(`    ✓ Match (rules agree with current tagging):      ${String(matchCount).padStart(4)} (${Math.round(matchCount / total * 100)}%)`);
  console.log(`    ✗ Discrepancy (rules would re-categorise):       ${String(discrepancyCount).padStart(4)}`);
  console.log(`    - No match (would become uncategorised):         ${String(noMatchCount).padStart(4)}`);
  console.log(`    ~ Skipped (manual / excluded / uncategorised):   ${String(skippedCount).padStart(4)}`);

  if (discrepancies.length > 0) {
    console.log(`\n  Sample discrepancies (up to 20 of ${discrepancies.length}):`);
    for (let i = 0; i < Math.min(20, discrepancies.length); i++) {
      const d = discrepancies[i];
      const desc = d.description.slice(0, 38).padEnd(38);
      console.log(`  ${String(i + 1).padStart(2)}. ${d.date} | '${desc}' | ${d.currentCat}/${d.currentSub} → ${d.wouldBeCat}/${d.wouldBeSub}`);
    }

    // Summary by change type
    const changeMap = new Map<string, number>();
    for (const d of discrepancies) {
      const key = `${d.currentCat}/${d.currentSub} → ${d.wouldBeCat}/${d.wouldBeSub}`;
      changeMap.set(key, (changeMap.get(key) ?? 0) + 1);
    }
    console.log('\n  Discrepancy summary by destination change:');
    for (const [change, count] of [...changeMap.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(3)}× ${change}`);
    }
  }

  // ── SECTION 5: Final summary ───────────────────────────────────────────────
  console.log('\n' + HR2);
  if (DRY_RUN) {
    console.log('DRY-RUN COMPLETE');
    console.log(HR2);
    console.log(`  ${resolvedRules.length} rules ready to import`);
    console.log(`  ${conflicts.length} potential conflict(s) (review above before execute)`);
    console.log(`  ${discrepancyCount} transaction discrepancy(s) (review above before execute)`);
    console.log('');
    console.log('  To proceed: set DRY_RUN = false in this script and re-run.');
    process.exit(0);
  }

  // ── EXECUTE ────────────────────────────────────────────────────────────────
  console.log('EXECUTE — writing rules to DynamoDB via API');
  console.log(HR2);
  console.log('');

  let successCount = 0, failCount = 0;

  for (let i = 0; i < resolvedRules.length; i++) {
    const r = resolvedRules[i];
    const body = {
      match:        r.match,
      matchType:    r.matchType,
      categoryId:   r.categoryId,
      subcategoryId: r.subcategoryId,
      name:         r.match.slice(0, 50),
      enabled:      true,
      priority:     100,
      isBusiness:   false,
      learned:      r.learned,
    };

    try {
      const resp = await fetch(RULES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${idToken}`,
          'x-account-id':  ACCOUNT_ID,
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        const data = await resp.json() as { rule?: { ruleId?: string } };
        console.log(`  Rule ${String(i + 1).padStart(2)}/${resolvedRules.length}: OK  ruleId=${data.rule?.ruleId ?? '?'}  ${r.match.slice(0, 40)}`);
        successCount++;
      } else {
        const text = await resp.text();
        console.error(`  Rule ${String(i + 1).padStart(2)}/${resolvedRules.length}: HTTP ${resp.status}  ${r.match.slice(0, 40)}`);
        console.error(`    Body: ${text.slice(0, 200)}`);
        failCount++;
      }
    } catch (err) {
      console.error(`  Rule ${String(i + 1).padStart(2)}/${resolvedRules.length}: NETWORK ERROR  ${r.match.slice(0, 40)}: ${err}`);
      failCount++;
    }
  }

  console.log('\n' + HR2);
  console.log('EXECUTE COMPLETE');
  console.log(HR2);
  console.log(`  ${resolvedRules.length} attempted  |  ${successCount} succeeded  |  ${failCount} failed`);

  if (failCount > 0) { console.log('\n  ⚠ Some rules failed — review errors above.'); process.exit(1); }

  // Post-execute verification
  console.log('\n  Post-execute verification...');
  const finalCount = await fetchRulesCount();
  console.log(`  Rules in DynamoDB: ${finalCount} (expected: ${resolvedRules.length})`);
  if (finalCount === resolvedRules.length) {
    console.log('  ✓ Verification passed');
  } else {
    console.log(`  ✗ Count mismatch (expected ${resolvedRules.length}, got ${finalCount}) — investigate`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
