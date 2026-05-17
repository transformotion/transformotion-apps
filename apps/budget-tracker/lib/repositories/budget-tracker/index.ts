import { getConfig } from '@/lib/config'
import { getBudgetHttp } from '@/lib/api'
import { LocalTransactionRepository } from './transaction-repository'
import { LocalMatchingRulesRepository } from './rules-repository'
import { DynamoTransactionRepository } from './dynamo-transaction-repository'
import { DynamoMatchingRulesRepository } from './dynamo-rules-repository'
import { DynamoBudgetDataRepository } from './dynamo-budget-data-repository'
import { LocalBudgetDataRepository } from './budget-data-repository'
import { DynamoSettingsRepository } from './dynamo-settings-repository'
import { LocalSettingsRepository } from './settings-repository'
import type { TransactionRepository, MatchingRulesRepository, BudgetDataRepository, SettingsRepository } from '@transformotion/budget-domain'

export type { Transaction, TransactionRepository } from '@transformotion/budget-domain'
export type { MatchingRule, MatchingRulesRepository } from '@transformotion/budget-domain'
export type { BudgetData, BudgetDataRepository, Category, Subcategory, BudgetFrequency } from '@transformotion/budget-domain'
export type { BudgetSettings, SettingsRepository } from '@transformotion/budget-domain'
export { LocalTransactionRepository } from './transaction-repository'
export { LocalMatchingRulesRepository } from './rules-repository'
export { getMatchingRulesRepository } from './rules-repository'
export type { TransactionFilters } from './settings-repository'
export { getFilters, saveFilters, clearFilters, DEFAULT_FILTERS } from './settings-repository'

let _txRepo: TransactionRepository | null = null
let _matchingRulesRepo: MatchingRulesRepository | null = null
let _budgetDataRepo: BudgetDataRepository | null = null
let _settingsRepo: SettingsRepository | null = null

export function getTransactionRepository(): TransactionRepository {
  if (!_txRepo) {
    _txRepo = getConfig().storage.provider === 'dynamo'
      ? new DynamoTransactionRepository(getBudgetHttp())
      : new LocalTransactionRepository()
  }
  return _txRepo
}

export function getMatchingRulesRepositoryInstance(): MatchingRulesRepository {
  if (!_matchingRulesRepo) {
    _matchingRulesRepo = getConfig().storage.provider === 'dynamo'
      ? new DynamoMatchingRulesRepository(getBudgetHttp())
      : new LocalMatchingRulesRepository()
  }
  return _matchingRulesRepo
}

export function getBudgetDataRepository(): BudgetDataRepository {
  if (!_budgetDataRepo) {
    _budgetDataRepo = getConfig().storage.provider === 'dynamo'
      ? new DynamoBudgetDataRepository(getBudgetHttp())
      : new LocalBudgetDataRepository()
  }
  return _budgetDataRepo
}

export function getSettingsRepository(): SettingsRepository {
  if (!_settingsRepo) {
    _settingsRepo = getConfig().storage.provider === 'dynamo'
      ? new DynamoSettingsRepository(getBudgetHttp())
      : new LocalSettingsRepository()
  }
  return _settingsRepo
}
