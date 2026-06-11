import { describe, it, expect } from 'vitest';
import {
  LAUNCHPAD_APPS,
  entitledSlugsFromSelections,
  deriveAppTiles,
  hasVisibleApps,
  resolveDisplayName,
  firstNameOf,
} from './entitlement';

const visibleSlugs = (entitled: string[]) =>
  deriveAppTiles(LAUNCHPAD_APPS, new Set(entitled))
    .filter((t) => t.visible)
    .map((t) => t.slug);

describe('entitledSlugsFromSelections', () => {
  it('maps active-account selections to the entitled slug set', () => {
    const set = entitledSlugsFromSelections([
      { appSlug: 'stock-analyser', accountId: 'a1' },
      { appSlug: 'budget-tracker', accountId: 'a2' },
    ]);
    expect([...set].sort()).toEqual(['budget-tracker', 'stock-analyser']);
  });

  it('returns an empty set for no selections (zero-membership user)', () => {
    expect(entitledSlugsFromSelections([]).size).toBe(0);
  });
});

describe('deriveAppTiles — three-state model (D11)', () => {
  it('shows a deployed app ONLY when the user is entitled', () => {
    expect(visibleSlugs(['stock-analyser'])).toEqual(['stock-analyser']);
  });

  it('hides a deployed app when the user has no membership', () => {
    // entitled to BT only → SA hidden, BT shown
    expect(visibleSlugs(['budget-tracker'])).toEqual(['budget-tracker']);
  });

  it('shows multiple entitled apps in registry order', () => {
    expect(visibleSlugs(['budget-tracker', 'stock-analyser'])).toEqual([
      'stock-analyser',
      'budget-tracker',
    ]);
  });

  it('never shows the not-deployed marketing app (coming-soon stays hidden)', () => {
    // even if a stray entitlement slug matched it, it is not entitlement-gated
    expect(visibleSlugs(['transformation-framework'])).toEqual([]);
  });

  it('shows nothing for a zero-membership user (empty state)', () => {
    const tiles = deriveAppTiles(LAUNCHPAD_APPS, new Set());
    expect(hasVisibleApps(tiles)).toBe(false);
    expect(visibleSlugs([])).toEqual([]);
  });

  it('marks visible gated tiles launchable and tolerates unknown slugs', () => {
    const tiles = deriveAppTiles(LAUNCHPAD_APPS, new Set(['stock-analyser', 'made-up-app']));
    const sa = tiles.find((t) => t.slug === 'stock-analyser')!;
    expect(sa.visible).toBe(true);
    expect(sa.launchable).toBe(true);
    expect(hasVisibleApps(tiles)).toBe(true);
  });
});

describe('resolveDisplayName — canonical fallback chain (D6)', () => {
  it('uses displayName when present', () => {
    expect(resolveDisplayName({ displayName: 'Ada Lovelace', email: 'ada@example.com' })).toBe(
      'Ada Lovelace',
    );
  });

  it('trims whitespace-only displayName and falls back to email local part', () => {
    expect(resolveDisplayName({ displayName: '   ', email: 'carol@example.com' })).toBe('carol');
  });

  it('falls back to email local part when displayName is missing (legacy user)', () => {
    expect(resolveDisplayName({ email: 'dave@example.com' })).toBe('dave');
  });

  it('handles null displayName', () => {
    expect(resolveDisplayName({ displayName: null, email: 'eve@example.com' })).toBe('eve');
  });

  it('falls back to full email when there is no local part', () => {
    expect(resolveDisplayName({ email: '@example.com' })).toBe('@example.com');
  });
});

describe('firstNameOf', () => {
  it('returns the first token', () => {
    expect(firstNameOf('Ada Lovelace')).toBe('Ada');
  });

  it('returns the whole string when single-token', () => {
    expect(firstNameOf('carol')).toBe('carol');
  });
});
