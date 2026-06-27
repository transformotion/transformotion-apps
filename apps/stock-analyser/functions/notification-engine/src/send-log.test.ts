import { describe, expect, it, vi } from 'vitest';
import { writeSendLog } from './send-log';
import type { SendLogAccount, SendLogRun } from './engine';

// #578 — the send-log WRITE must be fault-tolerant: one poison account is
// recorded as errored and the loop CONTINUES (it never drops the accounts that
// follow), the run status reflects the loss honestly, and the SUMMARY is
// written last so its status is the real one.

function account(id: string, over: Partial<SendLogAccount> = {}): SendLogAccount {
  return {
    accountId: id,
    accountName: `Name ${id}`,
    status: 'skipped-no-eligible',
    transitions: [],
    emailsSent: 0,
    memberOutcomes: [{ userId: `u-${id}`, outcome: 'skipped', reason: 'consent-off' }],
    ...over,
  };
}

function run(accounts: SendLogAccount[], over: Partial<SendLogRun> = {}): SendLogRun {
  return {
    runId: 'run-1',
    ranAt: 1_700_000_000,
    status: 'success',
    accountsEvaluated: accounts.length,
    accountsProcessed: 0,
    accountsSkippedNotDue: 0,
    accountsSkippedNoEligible: accounts.length,
    emailsSent: 0,
    accounts,
    ...over,
  };
}

/** Index the persisted items by their store key (RUN#…/SUMMARY | ACCT#id). */
function persisted(items: Record<string, unknown>[]) {
  const summary = items.find((i) => i['sk'] === 'SUMMARY');
  const accounts = new Map(items.filter((i) => String(i['sk']).startsWith('ACCT#')).map((i) => [i['accountId'] as string, i]));
  return { summary, accounts };
}

describe('send-log fault-tolerant write (#578)', () => {
  it('all accounts persist on a clean run; SUMMARY carries the unchanged status', async () => {
    const items: Record<string, unknown>[] = [];
    const r = run([account('a'), account('b'), account('c')]);

    await writeSendLog(async (item) => { items.push(item); }, r);

    const { summary, accounts } = persisted(items);
    expect([...accounts.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(summary).toMatchObject({ status: 'success' });
    expect(r.status).toBe('success');
  });

  it('a poison account does NOT drop the accounts that follow it; the failing one is marked errored', async () => {
    // 'b' fails its first (normal) write; the stripped marker write succeeds.
    const items: Record<string, unknown>[] = [];
    const putItem = vi.fn(async (item: Record<string, unknown>) => {
      if (item['accountId'] === 'b' && item['status'] !== 'failed') {
        throw new Error('marshalling blew up on b');
      }
      items.push(item);
    });
    const r = run([account('a'), account('b'), account('c')]); // 'c' comes AFTER the poison

    await writeSendLog(putItem, r, { log: vi.fn() });

    const { summary, accounts } = persisted(items);
    // a, b, c ALL persisted — b survived as an errored marker, c was not dropped.
    expect([...accounts.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(accounts.get('a')).toMatchObject({ status: 'skipped-no-eligible' });
    expect(accounts.get('c')).toMatchObject({ status: 'skipped-no-eligible' }); // the load-bearing assertion
    expect(accounts.get('b')).toMatchObject({ status: 'failed' });
    expect(String(accounts.get('b')!['error'])).toContain('send-log write failed');
    // Honest status: escalated to partial on the wire AND in memory.
    expect(summary).toMatchObject({ status: 'partial' });
    expect(r.status).toBe('partial');
  });

  it('a run-level failure is never downgraded by a write loss (stays failed)', async () => {
    const items: Record<string, unknown>[] = [];
    const putItem = vi.fn(async (item: Record<string, unknown>) => {
      if (item['accountId'] === 'a' && item['status'] !== 'failed') throw new Error('write blip');
      items.push(item);
    });
    const r = run([account('a')], { status: 'failed', error: 'members scan failed' });

    await writeSendLog(putItem, r, { log: vi.fn() });

    expect(persisted(items).summary).toMatchObject({ status: 'failed' });
    expect(r.status).toBe('failed');
  });

  it('SUMMARY is written LAST (after every account)', async () => {
    const order: string[] = [];
    const r = run([account('a'), account('b')]);

    await writeSendLog(async (item) => { order.push(String(item['sk'])); }, r);

    expect(order[order.length - 1]).toBe('SUMMARY');
    expect(order.filter((sk) => sk.startsWith('ACCT#')).length).toBe(2);
  });
});
