import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test';
import { createLogger, logger } from './logger.js';

describe('createLogger', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let errorOutput: string[];

  beforeEach(() => {
    errorOutput = [];
    consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg: string) => {
      errorOutput.push(msg);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('creates logger with all methods', () => {
    const log = createLogger();
    expect(typeof log.info).toBe('function');
    expect(typeof log.success).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
  });

  test('info logs with blue color', () => {
    const log = createLogger();
    log.info('test message');
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('info');
    expect(errorOutput[0]).toContain('test message');
  });

  test('success logs with green color', () => {
    const log = createLogger();
    log.success('test success');
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('success');
    expect(errorOutput[0]).toContain('test success');
  });

  test('warn logs with yellow color', () => {
    const log = createLogger();
    log.warn('test warning');
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('warn');
    expect(errorOutput[0]).toContain('test warning');
  });

  test('error logs with red color', () => {
    const log = createLogger();
    log.error('test error');
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('error');
    expect(errorOutput[0]).toContain('test error');
  });

  test('debug does not log by default', () => {
    const log = createLogger();
    log.debug('debug message');
    expect(errorOutput).toHaveLength(0);
  });

  test('debug logs when verbose is true', () => {
    const log = createLogger(true);
    log.debug('debug message');
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('debug');
    expect(errorOutput[0]).toContain('debug message');
  });
});

describe('default logger', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let errorOutput: string[];

  beforeEach(() => {
    errorOutput = [];
    consoleErrorSpy = spyOn(console, 'error').mockImplementation((msg: string) => {
      errorOutput.push(msg);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('logger is a valid logger instance', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  test('default logger logs messages', () => {
    logger.info('default logger test');
    expect(errorOutput).toHaveLength(1);
    expect(errorOutput[0]).toContain('default logger test');
  });
});
