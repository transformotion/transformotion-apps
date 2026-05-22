export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  userId?: string
  accountId?: string
  app?: string
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
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: Error, context?: LogContext): void
  child(context: LogContext): Logger
  time<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T>
}

export interface LoggerConfig {
  level: LogLevel
  app?: string
}

export { ConsoleLogger, createLogger, getLogger } from './console-logger'
