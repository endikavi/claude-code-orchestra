import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  mainLogger,
  ipcLogger,
  dataStoreLogger,
  processLogger,
  configLogger,
} from './logger';

describe('Logger', () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with the specified context', () => {
      const logger = createLogger('TestContext');
      logger.info('Test message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0];
      expect(call[0]).toContain('[TestContext]');
      expect(call[0]).toContain('Test message');
    });
  });

  describe('log levels', () => {
    it('should log debug messages', () => {
      const logger = createLogger('Test');
      logger.debug('Debug message');

      expect(consoleSpy.debug).toHaveBeenCalled();
      const call = consoleSpy.debug.mock.calls[0];
      expect(call[0]).toContain('[DEBUG]');
      expect(call[0]).toContain('Debug message');
    });

    it('should log info messages', () => {
      const logger = createLogger('Test');
      logger.info('Info message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0];
      expect(call[0]).toContain('[INFO]');
      expect(call[0]).toContain('Info message');
    });

    it('should log warn messages', () => {
      const logger = createLogger('Test');
      logger.warn('Warning message');

      expect(consoleSpy.warn).toHaveBeenCalled();
      const call = consoleSpy.warn.mock.calls[0];
      expect(call[0]).toContain('[WARN]');
      expect(call[0]).toContain('Warning message');
    });

    it('should log error messages', () => {
      const logger = createLogger('Test');
      logger.error('Error message');

      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0];
      expect(call[0]).toContain('[ERROR]');
      expect(call[0]).toContain('Error message');
    });
  });

  describe('logging with data', () => {
    it('should include data in debug log', () => {
      const logger = createLogger('Test');
      const data = { key: 'value' };
      logger.debug('Message with data', data);

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.debug.mock.calls[0][1]).toEqual(data);
    });

    it('should include data in info log', () => {
      const logger = createLogger('Test');
      const data = { count: 42 };
      logger.info('Message with data', data);

      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][1]).toEqual(data);
    });

    it('should include data in warn log', () => {
      const logger = createLogger('Test');
      const data = ['item1', 'item2'];
      logger.warn('Message with data', data);

      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.warn.mock.calls[0][1]).toEqual(data);
    });

    it('should format Error objects in error log', () => {
      const logger = createLogger('Test');
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(consoleSpy.error).toHaveBeenCalled();
      const loggedData = consoleSpy.error.mock.calls[0][1];
      expect(loggedData).toHaveProperty('name', 'Error');
      expect(loggedData).toHaveProperty('message', 'Test error');
      expect(loggedData).toHaveProperty('stack');
    });

    it('should log non-Error data in error log', () => {
      const logger = createLogger('Test');
      const data = { code: 500 };
      logger.error('Error occurred', data);

      expect(consoleSpy.error).toHaveBeenCalled();
      expect(consoleSpy.error.mock.calls[0][1]).toEqual(data);
    });
  });

  describe('child logger', () => {
    it('should create a child logger with combined context', () => {
      const parent = createLogger('Parent');
      const child = parent.child('Child');
      child.info('Child message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0];
      expect(call[0]).toContain('[Parent:Child]');
    });
  });

  describe('pre-configured loggers', () => {
    it('should export mainLogger', () => {
      expect(mainLogger).toBeDefined();
      mainLogger.info('Main logger test');
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[Main]');
    });

    it('should export ipcLogger', () => {
      expect(ipcLogger).toBeDefined();
      ipcLogger.info('IPC logger test');
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[IPC]');
    });

    it('should export dataStoreLogger', () => {
      expect(dataStoreLogger).toBeDefined();
      dataStoreLogger.info('DataStore logger test');
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[DataStore]');
    });

    it('should export processLogger', () => {
      expect(processLogger).toBeDefined();
      processLogger.info('Process logger test');
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[ProcessManager]');
    });

    it('should export configLogger', () => {
      expect(configLogger).toBeDefined();
      configLogger.info('Config logger test');
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.info.mock.calls[0][0]).toContain('[ConfigReader]');
    });
  });

  describe('timestamp', () => {
    it('should include ISO timestamp in log message', () => {
      const logger = createLogger('Test');
      logger.info('Timestamped message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0][0];
      // Check for ISO date format pattern
      expect(call).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('empty data handling', () => {
    it('should handle undefined data gracefully', () => {
      const logger = createLogger('Test');
      logger.info('No data');

      expect(consoleSpy.info).toHaveBeenCalled();
      // Second argument should be empty string when data is undefined
      expect(consoleSpy.info.mock.calls[0][1]).toBe('');
    });
  });
});
