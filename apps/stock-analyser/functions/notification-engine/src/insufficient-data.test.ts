import { describe, expect, it } from 'vitest';
import {
  insufficientDataAnalysis,
  isDegradedAnalysis,
} from '@transformotion/contracts/stock-analyser/structured-output';
import { isGroundingUnavailableError, GROUNDING_UNAVAILABLE_ERROR_CODE } from '@transformotion/fn-ai-proxy-core';
import { evaluateTransition } from './engine';

// #603 — newly-listed / thin-data ticker degrade. The distinguished insufficient-data
// result is HONEST (neutral, flagged), and notifications must treat it as NO signal.
describe('#603 insufficient-data distinguished result', () => {
  it('insufficientDataAnalysis is a neutral, flagged, non-fabricated result', () => {
    const a = insufficientDataAnalysis('SPCX');
    expect(a).toMatchObject({ ticker: 'SPCX', company: 'SPCX', verdict: 'NEUTRAL', dataStatus: 'insufficient-data' });
    expect(a.signals).toEqual([]);              // nothing fabricated
    expect(a.summary.toLowerCase()).toContain('insufficient data');
  });

  it('isDegradedAnalysis flags no-price + insufficient-data, not complete/absent', () => {
    expect(isDegradedAnalysis({ dataStatus: 'insufficient-data' })).toBe(true);
    expect(isDegradedAnalysis({ dataStatus: 'no-price' })).toBe(true);
    expect(isDegradedAnalysis({ dataStatus: 'complete' })).toBe(false);
    expect(isDegradedAnalysis({})).toBe(false); // absent ⇒ complete
  });

  it('notifications treat an insufficient-data result as NO signal (NEUTRAL ⇒ not actionable)', () => {
    const t = evaluateTransition({
      accountId: 'a', type: 'Portfolio', ticker: 'SPCX', analysis: insufficientDataAnalysis('SPCX'),
    });
    expect(t.currentVerdict).toBe('NEUTRAL');
    expect(t.actionable).toBe(false);
    expect(t.shouldNotify).toBe(false);
  });

  it('isGroundingUnavailableError distinguishes the #601 security hard-fail from other errors', () => {
    expect(GROUNDING_UNAVAILABLE_ERROR_CODE).toBe('grounding_unavailable');
    expect(isGroundingUnavailableError({ providerErrorCode: 'grounding_unavailable' })).toBe(true);
    expect(isGroundingUnavailableError(new Error('boom'))).toBe(false);
    expect(isGroundingUnavailableError({ providerErrorCode: 'rate_limit' })).toBe(false);
    expect(isGroundingUnavailableError(null)).toBe(false);
  });
});
