import { describe, expect, it } from 'vitest';
import {
  isValidWarmSurfaces,
  resolveWarmSurfaceState,
  WARM_SURFACES,
} from '@transformotion/contracts/stock-analyser/notification-preferences';

// The pure warm-surface resolver + validator (contracts). The engine and the
// settings UI both derive their behaviour from these; the engine.test.ts suite
// exercises them through runNotificationEngine — this pins them directly.
describe('resolveWarmSurfaceState (M19)', () => {
  it('absent config ⇒ every surface configured + effective (zero-migration default = all ON)', () => {
    const state = resolveWarmSurfaceState(undefined);
    for (const surface of WARM_SURFACES) {
      expect(state[surface]).toMatchObject({ configured: true, effective: true });
      expect(state[surface].blockedBy).toBeUndefined();
    }
  });

  it('only an explicit false disables a surface; surfaces are otherwise independent', () => {
    const state = resolveWarmSurfaceState({ etfs: false, metals: false });
    expect(state.etfs).toMatchObject({ configured: false, effective: false });
    expect(state.metals).toMatchObject({ configured: false, effective: false });
    expect(state.market.effective).toBe(true);
    expect(state.portfolio.effective).toBe(true);
    expect(state.watchlist.effective).toBe(true);
  });

  it('recs⇒market: recs ON + market OFF ⇒ recs effective false, blockedBy market', () => {
    const state = resolveWarmSurfaceState({ market: false, recs: true });
    expect(state.market).toMatchObject({ configured: false, effective: false });
    expect(state.recs).toMatchObject({ configured: true, effective: false, blockedBy: 'market' });
  });

  it('recs⇒market: recs OFF + market ON ⇒ recs simply off, market unaffected, no blockedBy', () => {
    const state = resolveWarmSurfaceState({ recs: false });
    expect(state.market.effective).toBe(true);
    expect(state.recs).toMatchObject({ configured: false, effective: false });
    expect(state.recs.blockedBy).toBeUndefined();
  });
});

describe('isValidWarmSurfaces (M19)', () => {
  it('accepts absent/null and any subset of known boolean keys', () => {
    expect(isValidWarmSurfaces(undefined)).toBe(true);
    expect(isValidWarmSurfaces(null)).toBe(true);
    expect(isValidWarmSurfaces({})).toBe(true);
    expect(isValidWarmSurfaces({ market: true, portfolio: false })).toBe(true);
  });

  it('rejects unknown keys, non-boolean values, and non-objects', () => {
    expect(isValidWarmSurfaces({ bogus: true })).toBe(false);
    expect(isValidWarmSurfaces({ market: 'yes' })).toBe(false);
    expect(isValidWarmSurfaces({ recs: 1 })).toBe(false);
    expect(isValidWarmSurfaces([])).toBe(false);
    expect(isValidWarmSurfaces('nope')).toBe(false);
  });
});
