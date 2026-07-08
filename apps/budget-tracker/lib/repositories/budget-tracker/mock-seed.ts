import type { BudgetData, Transaction } from '@transformotion/budget-domain'

/**
 * Mock-only demo data for the local/stub provider. NEVER used under the `dynamo`
 * provider (deployed BT), so this cannot affect production — the Local*Repository
 * classes are only instantiated when `storage.provider !== 'dynamo'`
 * (see `repositories/budget-tracker/index.ts`).
 *
 * Seeds a demonstrable Review flow on a fresh browser: a set of uncategorised
 * transactions across several merchants, including THREE `COLES` rows so that
 * accepting one suggestion cascades onto the others. Categories are seeded too,
 * because the AI Review must categorise into an existing tree (the mock AI keys
 * off category/subcategory names).
 */

export const MOCK_SEED_BUDGET_DATA: BudgetData = {
  categories: [
    {
      categoryId: 'seed-cat-living',
      name: 'Living',
      type: 'regular',
      displayOrder: 1,
      subcategories: [
        { subcategoryId: 'seed-sub-supermarket', name: 'Supermarket', displayOrder: 1 },
        { subcategoryId: 'seed-sub-fuel', name: 'Fuel', displayOrder: 2 },
      ],
    },
    {
      categoryId: 'seed-cat-entertainment',
      name: 'Eating-out & Entertainment',
      type: 'regular',
      displayOrder: 2,
      subcategories: [
        { subcategoryId: 'seed-sub-restaurants', name: 'Restaurants', displayOrder: 1 },
        { subcategoryId: 'seed-sub-streaming', name: 'Movies shows & music', displayOrder: 2 },
      ],
    },
    {
      categoryId: 'seed-cat-income',
      name: 'Income',
      type: 'regular',
      displayOrder: 3,
      subcategories: [
        { subcategoryId: 'seed-sub-takehome', name: 'Your take-home pay', displayOrder: 1 },
      ],
    },
    {
      categoryId: 'seed-cat-financial',
      name: 'Financial & Insurance',
      type: 'regular',
      displayOrder: 4,
      subcategories: [
        { subcategoryId: 'seed-sub-transfer', name: 'Transfer', displayOrder: 1, excludeFromCashflow: true },
        { subcategoryId: 'seed-sub-software', name: 'Software & subscriptions', displayOrder: 2 },
      ],
    },
  ],
  budgetAmounts: {},
  budgetFrequencies: {},
}

function seedTx(transactionId: string, date: string, amount: string, description: string): Transaction {
  return {
    transactionId,
    accountId: 'mock-account',
    date,
    amount,
    description,
    categoryId: null,
    subcategoryId: null,
    file: 'seed.csv',
    _manual: false,
    _business: false,
  }
}

export const MOCK_SEED_TRANSACTIONS: Transaction[] = [
  seedTx('seed-tx-1', '02/07/2026', '-84.50', 'COLES 0342 MOOLOOLABA'),
  seedTx('seed-tx-2', '04/07/2026', '-53.20', 'COLES 1122 BUDERIM'),
  seedTx('seed-tx-3', '06/07/2026', '-112.75', 'COLES 5567 MAROOCHYDORE'),
  seedTx('seed-tx-4', '03/07/2026', '-25.00', 'VERCEL INC. HTTPSVERCEL. CA'),
  seedTx('seed-tx-5', '05/07/2026', '-78.40', 'BP TANAWHA 4556 TANAWHA QLD'),
  seedTx('seed-tx-6', '01/07/2026', '-22.99', 'NETFLIX.COM'),
  seedTx('seed-tx-7', '01/07/2026', '3200.00', 'SALARY ACME PTY LTD'),
]
