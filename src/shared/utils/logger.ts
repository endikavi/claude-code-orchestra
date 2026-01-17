type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  contextPrefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  enableConsole: true,
};

class Logger {
  private config: LoggerConfig;
  private context: string;

  constructor(context: string, config: Partial<LoggerConfig> = {}) {
    this.context = config.contextPrefix ? `${config.contextPrefix}:${context}` : context;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  private formatMessage(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      `[${entry.context}]`,
      entry.message,
    ];
    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      data,
    };

    if (this.config.enableConsole) {
      const formattedMessage = this.formatMessage(entry);

      switch (level) {
        case 'debug':
          console.debug(formattedMessage, data !== undefined ? data : '');
          break;
        case 'info':
          console.info(formattedMessage, data !== undefined ? data : '');
          break;
        case 'warn':
          console.warn(formattedMessage, data !== undefined ? data : '');
          break;
        case 'error':
          console.error(formattedMessage, data !== undefined ? data : '');
          break;
      }
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: unknown): void {
    let errorData: unknown = error;

    if (error instanceof Error) {
      errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.log('error', message, errorData);
  }

  /**
   * Create a child logger with a sub-context
   */
  child(subContext: string): Logger {
    return new Logger(subContext, {
      ...this.config,
      contextPrefix: this.context,
    });
  }
}

/**
 * Create a logger instance for a specific context
 * @param context - The context name (e.g., 'DataStore', 'IPC', 'ProcessManager')
 * @returns A logger instance
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Pre-configured loggers for common contexts
export const mainLogger = createLogger('Main');
export const ipcLogger = createLogger('IPC');
export const dataStoreLogger = createLogger('DataStore');
export const processLogger = createLogger('ProcessManager');
export const configLogger = createLogger('ConfigReader');
