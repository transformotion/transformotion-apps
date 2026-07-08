import type { AiCsvAnalysisResponse } from '@transformotion/budget-domain'
import type { AIService, ReviewTransactionsInput, AnalyseCsvFormatInput, ReviewResult, ReviewTransactionsResult } from './index'

export class MockAIService implements AIService {
  async reviewTransactions(input: ReviewTransactionsInput): Promise<ReviewTransactionsResult> {
    const jobId = crypto.randomUUID()
    const batchSize = input.settings?.batchSize ?? 5

    // Simulate async batch streaming with a slight delay per batch
    const run = async () => {
      for (let i = 0; i < input.transactions.length; i += batchSize) {
        await simulateDelay()
        const batch = input.transactions.slice(i, i + batchSize)
        const results: ReviewResult[] = batch.map(tx => {
          const desc = tx.description.toLowerCase()

          let matchedCategoryId = ''
          let matchedSubcategoryId = ''

          const keywords: Array<{ pattern: RegExp; catName: string; subName: string }> = [
            { pattern: /woolworths|coles|aldi|supermarket/, catName: 'Groceries', subName: 'Supermarket' },
            { pattern: /salary|payroll|pay|income/, catName: 'Income', subName: 'Your take-home pay' },
            { pattern: /netflix|spotify|disney|streaming/, catName: 'Eating-out & Entertainment', subName: 'Movies shows & music' },
            { pattern: /restaurant|cafe|coffee/, catName: 'Eating-out & Entertainment', subName: 'Restaurants' },
            { pattern: /transfer|tfr/, catName: 'Financial & Insurance', subName: 'Transfer' },
          ]

          for (const { pattern, catName, subName } of keywords) {
            if (!pattern.test(desc)) continue
            const cat = input.categories.find(c => c.name === catName)
            if (!cat) continue
            const sub = cat.subcategories.find(s => s.name === subName)
            if (sub) {
              matchedCategoryId = cat.categoryId
              matchedSubcategoryId = sub.subcategoryId
              break
            }
            if (cat.subcategories.length > 0) {
              matchedCategoryId = cat.categoryId
              matchedSubcategoryId = cat.subcategories[0].subcategoryId
              break
            }
          }

          if (!matchedCategoryId && input.categories.length > 0) {
            const cat = input.categories[0]
            matchedCategoryId = cat.categoryId
            matchedSubcategoryId = cat.subcategories[0]?.subcategoryId ?? ''
          }

          return {
            index: tx.index,
            categoryId: matchedCategoryId,
            subcategoryId: matchedSubcategoryId,
            reason: `Mock categorisation based on description keywords for "${tx.description}".`,
            confidence: 'high' as const,
            // Minimal merchant token from the description — the first token is
            // always a (case-insensitive) substring, so it satisfies the
            // self-match invariant. Case doesn't matter: the matcher is `i`-flagged.
            suggestedPattern: mockMerchantToken(tx.description),
            suggestedRuleName: mockRuleName(tx.description),
          }
        })

        input.onBatch?.(results, 1)
      }
    }

    // Fire and forget — caller receives jobId immediately
    run().catch(console.error)

    return { jobId }
  }

  async analyseCsvFormat(_input: AnalyseCsvFormatInput): Promise<AiCsvAnalysisResponse> {
    await simulateDelay()
    return {
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      dateFormat: 'DD/MM/YYYY',
      hasHeader: true,
      confidence: 'high',
      notes: 'Mock analysis: standard Australian bank CSV format detected.',
    }
  }
}

export function createMockAIService(): MockAIService {
  return new MockAIService()
}

async function simulateDelay(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 400))
}

function firstToken(description: string): string {
  return description.trim().split(/\s+/)[0] ?? ''
}

function mockMerchantToken(description: string): string {
  return firstToken(description).toUpperCase()
}

function mockRuleName(description: string): string {
  const token = firstToken(description)
  if (!token) return 'Custom rule'
  const titled = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  return `${titled} rule`
}
