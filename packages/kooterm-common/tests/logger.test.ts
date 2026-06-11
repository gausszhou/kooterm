import { describe, it, expect, vi } from 'vitest';
import { log, setLogger } from '@kooterm/common';

describe('logger', () => {
  it('should have default consoleLogger with all methods', () => {
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.setLevel).toBe('function');
  });

  it('setLogger should replace the log object', () => {
    const mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      setLevel: vi.fn(),
    };
    setLogger(mockLogger);

    log.debug('test debug');
    log.info('test info');
    log.warn('test warn');
    log.error('test error');
    log.setLevel('silent');

    expect(mockLogger.debug).toHaveBeenCalledWith('test debug');
    expect(mockLogger.info).toHaveBeenCalledWith('test info');
    expect(mockLogger.warn).toHaveBeenCalledWith('test warn');
    expect(mockLogger.error).toHaveBeenCalledWith('test error');
    expect(mockLogger.setLevel).toHaveBeenCalledWith('silent');

    setLogger({ debug: console.debug, info: console.info, warn: console.warn, error: console.error, setLevel: () => {} });
  });

  it('default setLevel is no-op', () => {
    expect(() => log.setLevel('debug')).not.toThrow();
  });
});
