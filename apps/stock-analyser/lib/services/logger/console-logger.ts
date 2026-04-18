/**
 * Console Logger Implementation
 * 
 * Structured logging to browser/Node console.
 * Outputs JSON format for easy parsing by CloudWatch.
 */

import { Logger, LogLevel, LogContext, LogEntry, LoggerConfig, AppName } from './index'
import { getConfig } from '../../config'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export class ConsoleLogger implements Logger {
  private level: LogLevel
  private baseContext: LogContext

  constructor(config: LoggerConfig, baseContext: LogContext = {}) {
    this.level = config.level
    this.baseContext = { ...baseContext, app: config.app }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level]
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.baseContext, ...context },
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    }

    return entry
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) return

    const entry = this.formatEntry(level, message, context, error)
    
    // Use structured JSON in production, readable format in development
    const isDev = process.env.NODE_ENV === 'development'
    
    if (isDev) {
      const prefix = `[${entry.level.toUpperCase()}] ${entry.timestamp}`
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
      
      switch (level) {
        case 'debug':
          console.debug(`${prefix} ${message}${contextStr}`)
          break
        case 'info':
          console.info(`${prefix} ${message}${contextStr}`)
          break
        case 'warn':
          console.warn(`${prefix} ${message}${contextStr}`)
          break
        case 'error':
          console.error(`${prefix} ${message}${contextStr}`, error || '')
          break
      }
    } else {
      // JSON format for CloudWatch Logs Insights
      console.log(JSON.stringify(entry))
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context)
  }

  error(message: string, error?: Error, context?: LogContext): void {
    this.log('error', message, context, error)
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger(
      { level: this.level, app: this.baseContext.app as AppName },
      { ...this.baseContext, ...context }
    )
  }

  async time<T>(label: string, fn: () => Promise<T>, context?: LogContext): Promise<T> {
    const start = performance.now()
    try {
      const result = await fn()
      const duration = Math.round(performance.now() - start)
      this.info(`${label} completed`, { ...context, duration })
      return result
    } catch (error) {
      const duration = Math.round(performance.now() - start)
      this.error(`${label} failed`, error as Error, { ...context, duration })
      throw error
    }
  }
}

// Factory function
export function createLogger(app?: AppName): Logger {
  const config = getConfig()
  return new ConsoleLogger({ level: config.logging.level, app })
}

// Singleton loggers per app
const loggers: Partial<Record<AppName, Logger>> = {}

export function getLogger(app: AppName): Logger {
  if (!loggers[app]) {
    loggers[app] = createLogger(app)
  }
  return loggers[app]!
}
