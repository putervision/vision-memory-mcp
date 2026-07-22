import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = config.LOG_LEVEL;
  return logLevels[level] >= logLevels[configuredLevel];
}

function formatMessage(
  level: LogLevel,
  message: string,
  ...args: any[]
): string {
  const timestamp = new Date().toISOString();
  if (process.env.LOG_FORMAT === 'json') {
    const details = args.map((arg) => {
      if (arg instanceof Error) {
        return { name: arg.name, message: arg.message, stack: arg.stack };
      }
      return arg;
    });
    return (
      JSON.stringify({
        timestamp,
        level,
        message,
        details: details.length > 0 ? details : undefined,
      }) + '\n'
    );
  }

  const formattedArgs = args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || `${arg.name}: ${arg.message}`;
      }
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    })
    .join(' ');

  return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs ? ' ' + formattedArgs : ''}\n`;
}

export const logger = {
  debug(message: string, ...args: any[]): void {
    if (shouldLog('debug')) {
      process.stderr.write(formatMessage('debug', message, ...args));
    }
  },

  info(message: string, ...args: any[]): void {
    if (shouldLog('info')) {
      process.stderr.write(formatMessage('info', message, ...args));
    }
  },

  warn(message: string, ...args: any[]): void {
    if (shouldLog('warn')) {
      process.stderr.write(formatMessage('warn', message, ...args));
    }
  },

  error(message: string, ...args: any[]): void {
    if (shouldLog('error')) {
      process.stderr.write(formatMessage('error', message, ...args));
    }
  },
};
