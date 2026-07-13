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

function formatMessage(level: LogLevel, message: string, ...args: any[]): string {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg) : arg
  ).join(' ');
  
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
  }
};
