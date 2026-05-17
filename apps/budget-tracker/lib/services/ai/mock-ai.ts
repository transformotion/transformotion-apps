import type { AiReviewResponse, AiCsvAnalysisResponse } from '@transformotion/budget-domain'
import type { AIService, ReviewTransactionsInput, AnalyseCsvFormatInput } from './index'

export class MockAIService implements AIService {
  async reviewTransactions(input: ReviewTransactionsInput): Promise<AiReviewResponse> {
    await simulateDelay()
    const categories = Object.keys(input.categories)

    const results: AiReviewResponse['results'] = input.transactions.map(tx => {
      const desc = tx.description.toLowerCase()
      let category = categories[0] ?? ''
      let subcategory = ''

      if (desc.includes('woolworths') || desc.includes('coles') || desc.includes('aldi')) {
        category = 'Groceries'
        subcategory = 'Supermarket'
      } else if (desc.includes('salary') || desc.includes('deposit') || desc.includes('pay')) {
        category = 'Income'
        subcategory = 'Your take-home pay'
      } else if (desc.includes('shell') || desc.includes('bp') || desc.includes('petrol') || desc.includes('fuel')) {
        category = 'Transport'
        subcategory = 'Fuel'
      } else if (desc.includes('restaurant') || desc.includes('cafe') || desc.includes('mcdonald') || desc.includes('hungry jack')) {
        category = 'Eating-out & Entertainment'
        subcategory = 'Restaurants & cafes'
      } else if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('disney')) {
        category = 'Eating-out & Entertainment'
        subcategory = 'Subscriptions'
      } else if (desc.includes('transfer') || desc.includes('tfr')) {
        category = 'Transfers'
        subcategory = 'Transfer'
      }

      const subs = input.categories[category]
      if (subs && !subs.includes(subcategory)) {
        subcategory = subs[0] ?? ''
      }

      return {
        index: tx.index,
        category,
        subcategory,
        reason: `Mock categorisation based on description keywords for "${tx.description}".`,
      }
    })

    input.onBatch?.(results)
    return { results }
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
  await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 600))
}
