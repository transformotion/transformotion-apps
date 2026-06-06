import { useCallback, useState } from 'react'
import { getAIService } from '@/lib/services/ai'
import type { ReviewTransactionsInput, ReviewTransactionsResult } from '@/lib/services/ai'

export interface UseAIReviewReturn {
  startReview: (input: ReviewTransactionsInput) => Promise<ReviewTransactionsResult>
  isReviewing: boolean
  error: Error | null
}

export function useAIReview(): UseAIReviewReturn {
  const [isReviewing, setIsReviewing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const startReview = useCallback(async (input: ReviewTransactionsInput): Promise<ReviewTransactionsResult> => {
    setIsReviewing(true)
    setError(null)

    try {
      return await getAIService().reviewTransactions(input)
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error('AI review failed')
      setError(nextError)
      throw nextError
    } finally {
      setIsReviewing(false)
    }
  }, [])

  return {
    startReview,
    isReviewing,
    error,
  }
}
