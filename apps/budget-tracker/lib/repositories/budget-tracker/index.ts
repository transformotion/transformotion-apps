import { getConfig } from '@/lib/config'
import { getBudgetHttp } from '@/lib/api'
import { LocalTransactionRepository } from './transaction-repository'
import { LocalCustomRulesRepository } from './rules-repository'
import { DynamoTransactionRepository } from './dynamo-transaction-repository'
import { DynamoRulesRepository } from './dynamo-rules-repository'
import type { TransactionRepository, CustomRulesRepository } from '@transformotion/budget-domain'

export type { Transaction, TransactionRepository } from '@transformotion/budget-domain'
export type { CustomRule, CustomRulesRepository } from '@transformotion/budget-domain'
export type { BuiltinRule } from './rules-repository'
export { LocalTransactionRepository } from './transaction-repository'
export { LocalCustomRulesRepository } from './rules-repository'
export type {
  BudgetSettings,
  BudgetFrequency,
  TransactionFilters,
  SettingsRepository,
} from './settings-repository'
export { getSettingsRepository } from './settings-repository'

let _txRepo: TransactionRepository | null = null
let _customRulesRepo: CustomRulesRepository | null = null
let _localRulesRepo: LocalCustomRulesRepository | null = null

export function getTransactionRepository(): TransactionRepository {
  if (!_txRepo) {
    _txRepo = getConfig().storage.provider === 'dynamo'
      ? new DynamoTransactionRepository(getBudgetHttp())
      : new LocalTransactionRepository()
  }
  return _txRepo
}

export function getCustomRulesRepository(): CustomRulesRepository {
  if (!_customRulesRepo) {
    _customRulesRepo = getConfig().storage.provider === 'dynamo'
      ? new DynamoRulesRepository(getBudgetHttp())
      : new LocalCustomRulesRepository()
  }
  return _customRulesRepo
}

// Always local — builtin rules are frontend-only, never stored in DynamoDB
export function getRulesRepository(): LocalCustomRulesRepository {
  if (!_localRulesRepo) {
    _localRulesRepo = new LocalCustomRulesRepository()
  }
  return _localRulesRepo
}
