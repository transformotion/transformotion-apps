import { describe, expect, it, vi } from 'vitest';
import { parseStockAnalysisProviderResult } from './index';

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
});
