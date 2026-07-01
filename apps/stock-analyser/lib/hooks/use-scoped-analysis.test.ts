import { describe, it, expect } from 'vitest'
import { analysisRealCacheKey } from './analysis-cache-key'
import { isFresherCacheEntry } from './cache-reconcile'
import {
  ANALYSIS_NO_DATA_MESSAGE,
  normaliseAnalysisErrorForDisplay,
} from './analysis-error'

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

describe('isFresherCacheEntry — reconcile a stale view against the server cache (#stale-view)', () => {
  const future = Math.floor(Date.now() / 1000) + 3600
  const past = Math.floor(Date.now() / 1000) - 1

  it('serves a NEWER, non-expired entry that appeared after the fetch started', () => {
    expect(isFresherCacheEntry({ cachedAt: 100 }, { cachedAt: 200, expiresAt: future })).toBe(true)
  })

  it('does NOT serve an entry that is not newer than what we started from', () => {
    expect(isFresherCacheEntry({ cachedAt: 200 }, { cachedAt: 200, expiresAt: future })).toBe(false)
    expect(isFresherCacheEntry({ cachedAt: 300 }, { cachedAt: 200, expiresAt: future })).toBe(false)
  })

  it('does NOT serve a newer-but-expired entry', () => {
    expect(isFresherCacheEntry({ cachedAt: 100 }, { cachedAt: 200, expiresAt: past })).toBe(false)
  })

  it('handles a first-ever write (no prior entry) and a missing after-entry', () => {
    expect(isFresherCacheEntry(null, { cachedAt: 200, expiresAt: future })).toBe(true)
    expect(isFresherCacheEntry({ cachedAt: 100 }, null)).toBe(false)
  })
})

describe('normaliseAnalysisErrorForDisplay', () => {
  it('maps provider no-data guard messages to user-facing copy', () => {
    const openai = normaliseAnalysisErrorForDisplay(
      new Error('OpenAI grounded research did not contain enough verifiable data for structured output'),
    )
    const claude = normaliseAnalysisErrorForDisplay(
      new Error('Claude grounded research did not contain enough verifiable data for structured output'),
    )

    expect(openai.message).toBe(ANALYSIS_NO_DATA_MESSAGE)
    expect(claude.message).toBe(ANALYSIS_NO_DATA_MESSAGE)
  })

  it('preserves unrelated analysis errors for the inline banner', () => {
    const error = new Error('WSS job completion timeout')

    expect(normaliseAnalysisErrorForDisplay(error)).toBe(error)
  })
})
