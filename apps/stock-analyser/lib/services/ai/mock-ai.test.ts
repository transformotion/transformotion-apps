import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockAIService } from './mock-ai'

describe('MockAIService', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns stock recommendations from the mock fixture set', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const service = new MockAIService()
    const resultPromise = service.call<{ stocks: Array<{ ticker: string }> }>({
      prompt: 'Provide stock recommendations for Energy',
      forceRefresh: true,
    })

    await vi.advanceTimersByTimeAsync(800)

    await expect(resultPromise).resolves.toEqual({
      stocks: expect.arrayContaining([
        expect.objectContaining({ ticker: 'WDS.AX' }),
      ]),
    })
  })

  it('returns the generic fallback shape for unknown prompts', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const service = new MockAIService()
    const resultPromise = service.call<{ message: string }>({
      prompt: 'unmatched prompt',
      forceRefresh: true,
    })

    await vi.advanceTimersByTimeAsync(800)

    await expect(resultPromise).resolves.toEqual(expect.objectContaining({
      message: 'Mock response',
    }))
  })
})
