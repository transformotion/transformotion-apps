/**
 * Logging Utilities
 * 
 * Convenience exports for structured logging across the app.
 * Use these instead of console.log for production-ready logging.
 */

import { createLogger, getLogger, type Logger, type LogContext, type AppName } from './services/logger'

export { createLogger, getLogger, type Logger, type LogContext, type AppName }

// Pre-configured loggers for each app
export const launchpadLogger = getLogger('launchpad')
export const budgetLogger = getLogger('budget-tracker')
export const signalLogger = getLogger('stock-signal')

/**
 * Usage examples:
 * 
 * import { budgetLogger } from '@/lib/logging'
 * 
 * // Simple logging
 * budgetLogger.info('Transaction imported', { count: 10, filename: 'bank.csv' })
 * 
 * // Error logging
 * budgetLogger.error('Import failed', error, { filename: 'bank.csv' })
 * 
 * // Child logger with preset context
 * const importLogger = budgetLogger.child({ action: 'import' })
 * importLogger.info('Started import')
 * importLogger.info('Completed import', { count: 10 })
 * 
 * // Timed operations
 * await budgetLogger.time('Import transactions', async () => {
 *   // ... expensive operation
 * }, { filename: 'bank.csv' })
 */

/**
 * Log action wrapper for store actions.
 * Automatically logs start, success, and errors.
 */
export async function logAction<T>(
  logger: Logger,
  actionName: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  logger.info(`${actionName} started`, context)
  try {
    const result = await fn()
    logger.info(`${actionName} completed`, context)
    return result
  } catch (error) {
    logger.error(`${actionName} failed`, error as Error, context)
    throw error
  }
}

/**
 * Create a performance mark for browser DevTools.
 */
export function mark(name: string): void {
  if (typeof performance !== 'undefined' && performance.mark) {
    performance.mark(name)
  }
}

/**
 * Measure between two marks.
 */
export function measure(name: string, startMark: string, endMark?: string): number | null {
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      const measure = performance.measure(name, startMark, endMark)
      return measure.duration
    } catch {
      return null
    }
  }
  return null
}
