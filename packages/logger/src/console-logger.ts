import { Logger, LogLevel, LogContext, LogEntry, LoggerConfig } from './index'

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
      { level: this.level, app: this.baseContext.app },
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

export function createLogger(app?: string, level: LogLevel = 'info'): Logger {
  return new ConsoleLogger({ level, app })
}

const loggers: Record<string, Logger> = {}

export function getLogger(name: string): Logger {
  if (!loggers[name]) {
    loggers[name] = createLogger(name)
  }
  return loggers[name]!
}
