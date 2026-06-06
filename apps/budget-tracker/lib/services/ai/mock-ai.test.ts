import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@transformotion/budget-domain'
import { MockAIService } from './mock-ai'

const categories: Category[] = [
  {
    categoryId: 'cat-groceries',
    name: 'Groceries',
    type: 'regular',
    displayOrder: 1,
    subcategories: [{ subcategoryId: 'sub-supermarket', name: 'Supermarket', displayOrder: 1 }],
  },
]

describe('MockAIService', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('delivers batches before reviewTransactions resolves', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const service = new MockAIService()
    const batches: unknown[] = []
    let resolved = false

    const promise = service.reviewTransactions({
      transactions: [
        { index: 0, description: 'Woolworths', amount: '-42.10' },
      ],
      categories,
      onBatch: (results) => {
        batches.push(results)
        expect(resolved).toBe(false)
      },
    }).then(result => {
      resolved = true
      return result
    })

    await vi.advanceTimersByTimeAsync(400)
    const result = await promise

    expect(result.jobId).toEqual(expect.any(String))
    expect(batches).toHaveLength(1)
    expect(resolved).toBe(true)
  })
})
