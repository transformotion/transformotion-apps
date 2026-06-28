import { describe, expect, it, vi } from 'vitest';
import { parseMarketAnalysisProviderResult, parseStockAnalysisProviderResult } from './index';

describe('notification-engine AI result parsing', () => {
  it('logs model-output parse failures with provider, model, ticker, account, run, and output prefix', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      expect(() => parseStockAnalysisProviderResult({
        content: '<!DOCTYPE html><title>not json</title>',
        provider: 'openai',
        model: 'gpt-5.5',
        inputTokens: 10,
        outputTokens: 20,
      }, 'FMG.AX', {
        accountId: 'a03f9cd4-951f-463a-8b34-73c0f046e672',
        runId: 'run-1',
        sourceType: 'Watchlist',
      })).toThrow('model output unparseable while analysing FMG.AX');

      const logged = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
      expect(logged).toMatchObject({
        message: 'notification-analysis-model-output-unparseable',
        phase: 'model_output_json_parse',
        provider: 'openai',
        model: 'gpt-5.5',
        ticker: 'FMG.AX',
        accountId: 'a03f9cd4-951f-463a-8b34-73c0f046e672',
        runId: 'run-1',
        sourceType: 'Watchlist',
        modelOutputPrefix: '<!DOCTYPE html><title>not json</title>',
      });
    } finally {
      logSpy.mockRestore();
    }
  });

  it('logs market-warm parse failures with region, provider, model, raw output, stripped output, and token usage', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      expect(() => parseMarketAnalysisProviderResult({
        content: '```json\n{"macro":{"cycleStage":{"title":"Expansion"}}',
        provider: 'openai',
        model: 'gpt-5.5',
        inputTokens: 123,
        outputTokens: 4000,
        totalTokens: 4123,
      }, 'australia')).toThrow('market warm model output unparseable for australia');

      const logged = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;
      expect(logged).toMatchObject({
        message: 'notification-market-warm-model-output-unparseable',
        phase: 'market_warm_model_output_json_parse',
        region: 'australia',
        provider: 'openai',
        model: 'gpt-5.5',
        rawModelOutputPrefix: '```json\n{"macro":{"cycleStage":{"title":"Expansion"}}',
        strippedModelOutputPrefix: '{"macro":{"cycleStage":{"title":"Expansion"}}',
        rawModelOutputLength: 53,
        strippedModelOutputLength: 45,
        inputTokens: 123,
        outputTokens: 4000,
        totalTokens: 4123,
      });
      expect(String(logged.err)).toContain('JSON');
    } finally {
      logSpy.mockRestore();
    }
  });
});
