import type { AiReviewResponse, AiCsvAnalysisResponse } from '@transformotion/budget-domain'
import type { AIService, ReviewTransactionsInput, AnalyseCsvFormatInput } from './index'

export class MockAIService implements AIService {
  async reviewTransactions(input: ReviewTransactionsInput): Promise<AiReviewResponse> {
    await simulateDelay()

    const results: AiReviewResponse['results'] = input.transactions.map(tx => {
      const desc = tx.description.toLowerCase()

      // Try to find a matching category/subcategory by keyword
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
        // fall back to first subcategory in that category
        if (cat.subcategories.length > 0) {
          matchedCategoryId = cat.categoryId
          matchedSubcategoryId = cat.subcategories[0].subcategoryId
          break
        }
      }

      // Default: first available category/subcategory
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
