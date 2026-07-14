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
    // Savings-role category with three archetype pots (sinking fund / target-only /
    // target+deadline behind-pace) so the Savings tab, Home tile and derived goal
    // are demonstrable on a fresh browser. Mock-only (Local*Repository); never prod.
    {
      categoryId: 'seed-cat-savings',
      name: 'Savings',
      type: 'regular',
      displayOrder: 5,
      role: 'savings',
      subcategories: [
        { subcategoryId: 'seed-sub-holidays', name: 'Holidays', displayOrder: 1 },
        { subcategoryId: 'seed-sub-newcar', name: 'New car', displayOrder: 2, potTarget: 15000 },
        { subcategoryId: 'seed-sub-house', name: 'House deposit', displayOrder: 3, potTarget: 50000, potDeadline: '2027-12', potOpeningBalance: 12000 },
      ],
    },
  ],
  // Monthly contributions (per #671) — Σ = 2,150/mo, the derived savings goal.
  budgetAmounts: {
    'seed-sub-holidays': 250,
    'seed-sub-newcar': 900,
    'seed-sub-house': 1000,
  },
  budgetFrequencies: {},
  savingsGoal: { mode: 'derived' },
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

// A savings pot movement: a MANUAL, categorised transaction in a savings
// subcategory, signed per direction (contribution +, withdrawal −).
function seedMovement(
  id: string,
  date: string,
  amount: string,
  description: string,
  subcategoryId: string,
): Transaction {
  return {
    transactionId: id,
    accountId: 'mock-account',
    date,
    amount,
    description,
    categoryId: 'seed-cat-savings',
    subcategoryId,
    file: 'manual',
    _manual: true,
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

  // Holidays — sinking fund (no target): balance 1,850; +3,000 in / −1,150 out this year.
  seedMovement('seed-sv-h1', '15/01/2026', '1000', 'Holiday fund', 'seed-sub-holidays'),
  seedMovement('seed-sv-h2', '10/02/2026', '-650', 'Weekend away', 'seed-sub-holidays'),
  seedMovement('seed-sv-h3', '15/03/2026', '1000', 'Holiday fund', 'seed-sub-holidays'),
  seedMovement('seed-sv-h4', '15/05/2026', '1000', 'Holiday fund', 'seed-sub-holidays'),
  seedMovement('seed-sv-h5', '20/06/2026', '-500', 'Day trip', 'seed-sub-holidays'),

  // New car — target $15,000, no deadline: +900/mo Jan–Jul → balance 6,300 (42%).
  seedMovement('seed-sv-c1', '15/01/2026', '900', 'Car fund', 'seed-sub-newcar'),
  seedMovement('seed-sv-c2', '15/02/2026', '900', 'Car fund', 'seed-sub-newcar'),
  seedMovement('seed-sv-c3', '15/03/2026', '900', 'Car fund', 'seed-sub-newcar'),
  seedMovement('seed-sv-c4', '15/04/2026', '900', 'Car fund', 'seed-sub-newcar'),
  seedMovement('seed-sv-c5', '15/05/2026', '900', 'Car fund', 'seed-sub-newcar'),
  seedMovement('seed-sv-c6', '15/06/2026', '900', 'Car fund', 'seed-sub-newcar'),
  seedMovement('seed-sv-c7', '15/07/2026', '900', 'Car fund', 'seed-sub-newcar'),

  // House deposit — target $50,000 by Dec 2027, opening $12,000: +11,400 → 23,400
  // (47%). Budgeting $1,000/mo vs a required ~$1,565/mo → BEHIND pace.
  seedMovement('seed-sv-d1', '15/01/2026', '5400', 'House deposit', 'seed-sub-house'),
  seedMovement('seed-sv-d2', '15/02/2026', '1000', 'House deposit', 'seed-sub-house'),
  seedMovement('seed-sv-d3', '15/03/2026', '1000', 'House deposit', 'seed-sub-house'),
  seedMovement('seed-sv-d4', '15/04/2026', '1000', 'House deposit', 'seed-sub-house'),
  seedMovement('seed-sv-d5', '15/05/2026', '1000', 'House deposit', 'seed-sub-house'),
  seedMovement('seed-sv-d6', '15/06/2026', '1000', 'House deposit', 'seed-sub-house'),
  seedMovement('seed-sv-d7', '15/07/2026', '1000', 'House deposit', 'seed-sub-house'),
]
