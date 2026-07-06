import { chromium } from 'playwright'
import path from 'node:path'

// Seeds representative BudgetData + transactions into localStorage (mock/local
// provider), then captures the built BT Home dashboard + Budget tab.
const OUT = process.argv[2] || '.'
const BASE = 'http://localhost:3002/budget-tracker'

const CATS = {
  income: 'cat-income',
  housing: 'cat-housing',
  groceries: 'cat-groceries',
  transport: 'cat-transport',
  leisure: 'cat-leisure',
  savings: 'cat-savings',
}
const SUBS = {
  salary: 'sub-salary',
  mortgage: 'sub-mortgage',
  supermarket: 'sub-supermarket',
  fuel: 'sub-fuel',
  dining: 'sub-dining',
  emergency: 'sub-emergency',
}

const categories = [
  { categoryId: CATS.income, name: 'Income', type: 'regular', displayOrder: 0, role: 'income',
    subcategories: [{ subcategoryId: SUBS.salary, name: 'Salary', displayOrder: 0 }] },
  { categoryId: CATS.housing, name: 'Home & utilities', type: 'regular', displayOrder: 1,
    subcategories: [{ subcategoryId: SUBS.mortgage, name: 'Mortgage', displayOrder: 0 }] },
  { categoryId: CATS.groceries, name: 'Groceries', type: 'regular', displayOrder: 2,
    subcategories: [{ subcategoryId: SUBS.supermarket, name: 'Supermarket', displayOrder: 0 }] },
  { categoryId: CATS.transport, name: 'Car & Transport', type: 'regular', displayOrder: 3,
    subcategories: [{ subcategoryId: SUBS.fuel, name: 'Fuel', displayOrder: 0 }] },
  { categoryId: CATS.leisure, name: 'Eating-out & Entertainment', type: 'regular', displayOrder: 4,
    subcategories: [{ subcategoryId: SUBS.dining, name: 'Dining', displayOrder: 0 }] },
  { categoryId: CATS.savings, name: 'Savings', type: 'regular', displayOrder: 5, role: 'savings',
    subcategories: [{ subcategoryId: SUBS.emergency, name: 'Emergency Fund', displayOrder: 0, excludeFromCashflow: true }] },
]

const budgetData = {
  categories,
  budgetAmounts: {
    [SUBS.mortgage]: 1500, [SUBS.supermarket]: 750, [SUBS.fuel]: 400, [SUBS.dining]: 500,
  },
  budgetFrequencies: {
    [SUBS.mortgage]: 'monthly', [SUBS.supermarket]: 'monthly', [SUBS.fuel]: 'monthly', [SUBS.dining]: 'monthly',
  },
  savingsGoal: { targetAmount: 1000, linkedSubcategoryId: SUBS.emergency },
}

function mk(id, date, amount, description, categoryId, subcategoryId, category, subcategory) {
  return { transactionId: id, accountId: 'acct-mock', date, amount: String(amount), description,
    categoryId, subcategoryId, file: 'seed.csv', _manual: false, _business: false, category, subcategory }
}

const transactions = []
let n = 0
const months = ['01', '02', '03', '04', '05', '06']
for (const m of months) {
  transactions.push(mk(`t${n++}`, `05/${m}/2026`, 5600, 'Salary — Transformotion Ltd', CATS.income, SUBS.salary, 'Income', 'Salary'))
  transactions.push(mk(`t${n++}`, `10/${m}/2026`, -1450, 'Mortgage payment', CATS.housing, SUBS.mortgage, 'Home & utilities', 'Mortgage'))
  transactions.push(mk(`t${n++}`, `12/${m}/2026`, -620, 'Supermarket', CATS.groceries, SUBS.supermarket, 'Groceries', 'Supermarket'))
  transactions.push(mk(`t${n++}`, `14/${m}/2026`, -340, 'Fuel', CATS.transport, SUBS.fuel, 'Car & Transport', 'Fuel'))
  transactions.push(mk(`t${n++}`, `18/${m}/2026`, -480, 'Restaurant', CATS.leisure, SUBS.dining, 'Eating-out & Entertainment', 'Dining'))
  transactions.push(mk(`t${n++}`, `20/${m}/2026`, -780, 'Transfer to savings', CATS.savings, SUBS.emergency, 'Savings', 'Emergency Fund'))
}
// Specific recent June transactions for the Recent Transactions tile
transactions.push(mk(`t${n++}`, `09/06/2026`, -86.42, 'Tesco Superstore', CATS.groceries, SUBS.supermarket, 'Groceries', 'Supermarket'))
transactions.push(mk(`t${n++}`, `07/06/2026`, -62.10, 'Shell Fuel Station', CATS.transport, SUBS.fuel, 'Car & Transport', 'Fuel'))
transactions.push(mk(`t${n++}`, `07/06/2026`, -8.75, 'Costa Coffee', CATS.leisure, SUBS.dining, 'Eating-out & Entertainment', 'Dining'))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await ctx.addInitScript(([bd, txns]) => {
  localStorage.setItem('budget-tracker-budget-data', bd)
  localStorage.setItem('budget-tracker-transactions', txns)
}, [JSON.stringify(budgetData), JSON.stringify(transactions)])

const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(1500)
// Home dashboard: wait for a dashboard-only heading
try {
  await page.getByText('Income vs Spending').first().waitFor({ timeout: 20000 })
} catch {
  console.log('WARN: dashboard heading not found; capturing whatever rendered')
}
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(OUT, 'bt-home-built.png'), fullPage: true })
console.log('captured home')

// Budget tab (savings goal + role UI)
try {
  await page.getByRole('button', { name: 'Budget', exact: true }).first().click({ timeout: 8000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, 'bt-budget-built.png'), fullPage: true })
  console.log('captured budget')
} catch (e) {
  console.log('WARN: could not open Budget tab:', e.message)
}

await browser.close()
