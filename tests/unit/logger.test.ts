import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../../src/logger.js';
import { config } from '../../src/config.js';

describe('Logger Unit Tests', () => {
  let stderrSpy: any;
  const originalLogFormat = process.env.LOG_FORMAT;
  const originalLogLevel = config.LOG_LEVEL;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.env.LOG_FORMAT = originalLogFormat;
    config.LOG_LEVEL = originalLogLevel;
  });

  it('should write info, warn, and error logs to stderr', () => {
    config.LOG_LEVEL = 'info';
    logger.info('Info message', { foo: 'bar' });
    logger.warn('Warn message', new Error('test error'));
    logger.error('Error message');

    expect(stderrSpy).toHaveBeenCalledTimes(3);
    expect(stderrSpy.mock.calls[0][0]).toContain('[INFO] Info message {"foo":"bar"}');
    expect(stderrSpy.mock.calls[1][0]).toContain('[WARN] Warn message');
    expect(stderrSpy.mock.calls[2][0]).toContain('[ERROR] Error message');
  });

  it('should respect LOG_LEVEL configuration for debug logs', () => {
    config.LOG_LEVEL = 'info';
    logger.debug('Debug message should be ignored');
    expect(stderrSpy).not.toHaveBeenCalled();

    config.LOG_LEVEL = 'debug';
    logger.debug('Debug message should be logged');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toContain('[DEBUG] Debug message');
  });

  it('should format logs in JSON format when LOG_FORMAT is json', () => {
    process.env.LOG_FORMAT = 'json';
    config.LOG_LEVEL = 'debug';

    const testErr = new Error('json error');
    logger.info('JSON Log', { key: 'val' }, testErr);

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(stderrSpy.mock.calls[0][0]);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('JSON Log');
    expect(parsed.details).toHaveLength(2);
    expect(parsed.details[0]).toEqual({ key: 'val' });
    expect(parsed.details[1].message).toBe('json error');
  });
});
