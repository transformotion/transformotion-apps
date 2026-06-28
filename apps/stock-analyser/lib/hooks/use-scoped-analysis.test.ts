import { describe, it, expect } from 'vitest'
import { analysisRealCacheKey } from './analysis-cache-key'

// The v0 scope key ({surface}:{scopeKey}) must resolve to the SAME real server
// cache keys the tabs + the #584 warm job use — otherwise a Run cache-MISSES the
// warm entry even though it exists. This pins the mapping for EACH AI tab.
describe('analysisRealCacheKey — scope → real server cache key (#584 consume)', () => {
  it('market:{region} → MARKET#{region} (the key the warm job writes)', () => {
    expect(analysisRealCacheKey('market', 'australia')).toBe('MARKET#australia')
    expect(analysisRealCacheKey('market', 'us')).toBe('MARKET#us')
    expect(analysisRealCacheKey('market', 'global')).toBe('MARKET#global')
    expect(analysisRealCacheKey('market', 'uk')).toBe('MARKET#uk')
  })

  it('etfs:{market} → ETF#{market} (real key is ETF#, not ETFS#)', () => {
    expect(analysisRealCacheKey('etfs', 'ASX')).toBe('ETF#ASX')
    expect(analysisRealCacheKey('etfs', 'US')).toBe('ETF#US')
  })

  it('analyser:{ticker} → ANALYSIS#{ticker}', () => {
    expect(analysisRealCacheKey('analyser', 'BHP.AX')).toBe('ANALYSIS#BHP.AX')
  })

  it('recs:{universe|mode|sector} → RECS#{...}', () => {
    expect(analysisRealCacheKey('recs', 'ASX|Top Picks')).toBe('RECS#ASX|Top Picks')
    expect(analysisRealCacheKey('recs', 'NASDAQ|Bottom of Cycle|Energy')).toBe('RECS#NASDAQ|Bottom of Cycle|Energy')
  })

  it('metals → METALS (constant; scope ignored)', () => {
    expect(analysisRealCacheKey('metals', 'default')).toBe('METALS')
    expect(analysisRealCacheKey('metals', 'anything')).toBe('METALS')
  })

  it('distinct scopes never collide (own slot per scope)', () => {
    expect(analysisRealCacheKey('market', 'australia')).not.toBe(analysisRealCacheKey('market', 'us'))
    expect(analysisRealCacheKey('etfs', 'ASX')).not.toBe(analysisRealCacheKey('analyser', 'ASX'))
  })
})
