import { create } from 'zustand'

export type ReviewState = 'idle' | 'reviewing' | 'complete' | 'error'

export interface ReviewResult {
  transactionId: string
  description: string
  suggestedCategoryId: string
  suggestedSubcategoryId: string
  suggestedCategoryName: string
  suggestedSubcategoryName: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
  pass: 1 | 2
  status: 'pending' | 'accepted' | 'rejected'
}

interface ReviewStoreState {
  reviewState: ReviewState
  error: string | null
  reviewResults: ReviewResult[]
  progress: { completed: number; total: number }

  setReviewState: (state: ReviewState) => void
  setError: (error: string | null) => void
  setReviewResults: (results: ReviewResult[] | ((prev: ReviewResult[]) => ReviewResult[])) => void
  setProgress: (progress: { completed: number; total: number }) => void
  updateProgress: (fn: (prev: { completed: number; total: number }) => { completed: number; total: number }) => void
  updateResultStatus: (transactionId: string, status: 'accepted' | 'rejected') => void
  resetReview: () => void
}

export const useReviewStore = create<ReviewStoreState>()((set) => ({
  reviewState: 'idle',
  error: null,
  reviewResults: [],
  progress: { completed: 0, total: 0 },

  setReviewState: (reviewState) => set({ reviewState }),
  setError: (error) => set({ error }),
  setReviewResults: (resultsOrUpdater) => set((s) => ({
    reviewResults: typeof resultsOrUpdater === 'function'
      ? resultsOrUpdater(s.reviewResults)
      : resultsOrUpdater,
  })),
  setProgress: (progress) => set({ progress }),
  updateProgress: (fn) => set((s) => ({ progress: fn(s.progress) })),
  updateResultStatus: (transactionId, status) => set((s) => ({
    reviewResults: s.reviewResults.map((r) =>
      r.transactionId === transactionId ? { ...r, status } : r
    ),
  })),
  resetReview: () => set({
    reviewState: 'idle',
    error: null,
    reviewResults: [],
    progress: { completed: 0, total: 0 },
  }),
}))

export const selectReviewState = (s: ReviewStoreState) => s.reviewState
export const selectReviewResults = (s: ReviewStoreState) => s.reviewResults
export const selectReviewError = (s: ReviewStoreState) => s.error
export const selectReviewProgress = (s: ReviewStoreState) => s.progress
