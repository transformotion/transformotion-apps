/**
 * Logger Service Interface
 * 
 * Structured logging abstraction.
 * Current: Console logger
 * Future: CloudWatch via Lambda
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type AppName = 'launchpad' | 'budget-tracker'

export interface LogContext {
  userId?: string
  accountId?: string
  app?: AppName
  action?: string
  duration?: number
  [key: string]: unknown
}

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: LogContext
  error?: {
    name: string
    message: string
    stack?: string
  }
}

export interface Logger {
  /**
   * Log debug message (development only).
   */
  debug(message: string, context?: LogContext): void

  /**
   * Log info message.
   */
  info(message: string, context?: LogContext): void

  /**
   * Log warning message.
   */
  warn(message: string, context?: LogContext): void

  /**
   * Log error message with optional error object.
   */
  error(message: string, error?: Error, context?: LogContext): void

  /**
   * Create a child logger with preset context.
   */
  child(context: LogContext): Logger

  /**
   * Time an async operation.
   */
  time<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T>
}

export interface LoggerConfig {
  level: LogLevel
  app?: AppName
}

// Re-export console implementation as default
export { ConsoleLogger, createLogger, getLogger } from './console-logger'
