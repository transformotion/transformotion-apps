import { describe, it, expect } from 'vitest';
import {
  LAUNCHPAD_APPS,
  entitledSlugsFromSelections,
  deriveAppTiles,
  hasVisibleApps,
  resolveDisplayName,
  firstNameOf,
  fallbackWarnings,
} from './entitlement';

/** A viewer who holds the access group AND an account for each `slugs` app. */
const accessed = (slugs: string[]) => ({
  siteAdmin: false,
  appAdmin: new Set<string>(),
  appAccess: new Set(slugs),
  accounted: new Set(slugs),
});
const visibleSlugs = (slugs: string[]) =>
  deriveAppTiles(LAUNCHPAD_APPS, accessed(slugs))
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

  it('returns an empty set for no selections (zero-account user)', () => {
    expect(entitledSlugsFromSelections([]).size).toBe(0);
  });
});

describe('deriveAppTiles — groups-authoritative gate (M11)', () => {
  it('shows a deployed app ONLY when the viewer holds the access group', () => {
    expect(visibleSlugs(['stock-analyser'])).toEqual(['stock-analyser']);
  });

  it('hides a deployed app the viewer has no access group for', () => {
    expect(visibleSlugs(['budget-tracker'])).toEqual(['budget-tracker']);
  });

  it('shows multiple accessed apps in registry order', () => {
    expect(visibleSlugs(['budget-tracker', 'stock-analyser'])).toEqual([
      'stock-analyser',
      'budget-tracker',
    ]);
  });

  it('never shows the not-deployed marketing app (coming-soon stays hidden)', () => {
    expect(visibleSlugs(['transformation-framework'])).toEqual([]);
  });

  it('shows nothing for a viewer with no access groups (empty state)', () => {
    const tiles = deriveAppTiles(LAUNCHPAD_APPS, accessed([]));
    expect(hasVisibleApps(tiles)).toBe(false);
    expect(visibleSlugs([])).toEqual([]);
  });

  it('access-group + an account → visible, launchable, NOT create-first-account', () => {
    const sa = deriveAppTiles(LAUNCHPAD_APPS, accessed(['stock-analyser'])).find((t) => t.slug === 'stock-analyser')!;
    expect(sa).toMatchObject({ visible: true, launchable: true, needsFirstAccount: false });
  });

  it('access-group + ZERO accounts → visible, needsFirstAccount, NOT launchable (the app-grant persona)', () => {
    const viewer = { siteAdmin: false, appAdmin: new Set<string>(), appAccess: new Set(['stock-analyser']), accounted: new Set<string>() };
    const sa = deriveAppTiles(LAUNCHPAD_APPS, viewer).find((t) => t.slug === 'stock-analyser')!;
    expect(sa).toMatchObject({ visible: true, needsFirstAccount: true, launchable: false });
  });

  it('per-app mix: accounted SA beside access-no-account BT, independently', () => {
    const viewer = { siteAdmin: false, appAdmin: new Set<string>(), appAccess: new Set(['stock-analyser', 'budget-tracker']), accounted: new Set(['stock-analyser']) };
    const tiles = deriveAppTiles(LAUNCHPAD_APPS, viewer);
    expect(tiles.find((t) => t.slug === 'stock-analyser')).toMatchObject({ launchable: true, needsFirstAccount: false });
    expect(tiles.find((t) => t.slug === 'budget-tracker')).toMatchObject({ launchable: false, needsFirstAccount: true });
  });

  it('site-admin sees a deployed app even without the access group (normal launch tile, not create)', () => {
    const viewer = { siteAdmin: true, appAdmin: new Set<string>(), appAccess: new Set<string>(), accounted: new Set<string>() };
    const sa = deriveAppTiles(LAUNCHPAD_APPS, viewer).find((t) => t.slug === 'stock-analyser')!;
    expect(sa).toMatchObject({ visible: true, launchable: true, needsFirstAccount: false });
  });

  it('app-admin (no access group) sees the app as a normal tile, not create-first-account', () => {
    const viewer = { siteAdmin: false, appAdmin: new Set(['budget-tracker']), appAccess: new Set<string>(), accounted: new Set<string>() };
    const bt = deriveAppTiles(LAUNCHPAD_APPS, viewer).find((t) => t.slug === 'budget-tracker')!;
    expect(bt).toMatchObject({ visible: true, launchable: true, needsFirstAccount: false });
  });

  it('tolerates unknown slugs in the access set', () => {
    const viewer = { siteAdmin: false, appAdmin: new Set<string>(), appAccess: new Set(['stock-analyser', 'made-up']), accounted: new Set(['stock-analyser']) };
    expect(hasVisibleApps(deriveAppTiles(LAUNCHPAD_APPS, viewer))).toBe(true);
  });
});

describe('resolveDisplayName — canonical chain: displayName → Cognito name → email local part (#423)', () => {
  it('uses profile displayName when present', () => {
    expect(
      resolveDisplayName({ displayName: 'Ada Lovelace', cognitoName: 'Ignored', email: 'ada@example.com' }),
    ).toBe('Ada Lovelace');
  });

  it('uses a real Cognito name when there is no profile displayName', () => {
    expect(resolveDisplayName({ cognitoName: 'Steve Moodie', email: 'steve.moodie@example.com' })).toBe(
      'Steve Moodie',
    );
  });

  it('SKIPS the Cognito name when it equals the email, falling back to the local part (the bug)', () => {
    // auth client sets User.name = email when there is no given/family name
    expect(
      resolveDisplayName({ cognitoName: 'steve.moodie@example.com', email: 'steve.moodie@example.com' }),
    ).toBe('steve.moodie');
  });

  it('falls back to email local part when nothing else is set (legacy user)', () => {
    expect(resolveDisplayName({ email: 'dave@example.com' })).toBe('dave');
  });

  it('trims whitespace-only displayName and null cognitoName', () => {
    expect(resolveDisplayName({ displayName: '   ', cognitoName: null, email: 'carol@example.com' })).toBe(
      'carol',
    );
  });

  it('never returns the full email when a local part exists', () => {
    const out = resolveDisplayName({ cognitoName: 'eve@example.com', email: 'eve@example.com' });
    expect(out).toBe('eve');
    expect(out).not.toContain('@');
  });

  it('falls back to full email only when there is no local part', () => {
    expect(resolveDisplayName({ email: '@example.com' })).toBe('@example.com');
  });
});

describe('fallbackWarnings — loud degradation (#423)', () => {
  it('is silent when both tiles and profile come from the API', () => {
    expect(
      fallbackWarnings({ apiConfigured: true, tilesFromApi: true, profileFromApi: true }),
    ).toEqual([]);
  });

  it('warns once (expected) when the control-plane API URL is not configured', () => {
    const msgs = fallbackWarnings({ apiConfigured: false, tilesFromApi: false, profileFromApi: false });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/not configured/i);
  });

  it('warns per failed read when the API is configured but reads fail', () => {
    const msgs = fallbackWarnings({ apiConfigured: true, tilesFromApi: false, profileFromApi: false });
    expect(msgs).toHaveLength(2);
    expect(msgs.join(' ')).toMatch(/active-accounts read failed/);
    expect(msgs.join(' ')).toMatch(/profile read failed/);
  });

  it('warns only about profile when tiles came from the API', () => {
    const msgs = fallbackWarnings({ apiConfigured: true, tilesFromApi: true, profileFromApi: false });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/profile read failed/);
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
