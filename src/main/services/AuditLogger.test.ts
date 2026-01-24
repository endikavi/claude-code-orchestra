import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DataStore before importing AuditLogger
const mockDataStore = {
  getSecurityConfig: vi.fn(),
  addAuditEntry: vi.fn(),
  getAuditLog: vi.fn(),
  getAuditLogCount: vi.fn(),
  cleanupAuditLog: vi.fn(),
  clearAuditLog: vi.fn(),
};

vi.mock('./DataStore', () => ({
  DataStore: {
    getInstance: vi.fn(() => mockDataStore),
  },
}));

import { AuditLogger, getAuditLogger } from './AuditLogger';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  const defaultSecurityConfig = {
    auditLog: {
      enabled: true,
      level: 'info',
      retentionDays: 30,
      logEvents: {
        login: true,
        logout: true,
        failedLogin: true,
        sessionKick: true,
        instanceCreate: true,
        instanceKill: true,
        configChange: true,
      },
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Reset singleton
    (AuditLogger as unknown as { instance: null }).instance = null;

    mockDataStore.getSecurityConfig.mockReturnValue(defaultSecurityConfig);
    mockDataStore.addAuditEntry.mockImplementation((entry) => ({
      id: 'entry-123',
      ...entry,
      timestamp: Date.now(),
    }));
    mockDataStore.cleanupAuditLog.mockReturnValue(0);

    logger = AuditLogger.getInstance();
  });

  afterEach(() => {
    logger.destroy();
    vi.useRealTimers();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AuditLogger.getInstance();
      const instance2 = AuditLogger.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after destroy', () => {
      const instance1 = AuditLogger.getInstance();
      instance1.destroy();
      const instance2 = AuditLogger.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it('should be accessible via getAuditLogger helper', () => {
      const fromHelper = getAuditLogger();
      const fromStatic = AuditLogger.getInstance();
      expect(fromHelper).toBe(fromStatic);
    });
  });

  describe('log', () => {
    it('should log an audit event', () => {
      const entry = logger.log('login', '192.168.1.1', true, { sessionId: 'sess-123' });

      expect(entry).not.toBeNull();
      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith({
        event: 'login',
        ip: '192.168.1.1',
        success: true,
        sessionId: 'sess-123',
        details: undefined,
      });
    });

    it('should include details when provided', () => {
      logger.log('login', '192.168.1.1', true, { details: 'User-Agent: Chrome' });

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          details: 'User-Agent: Chrome',
        })
      );
    });

    it('should return null when audit logging is disabled', () => {
      mockDataStore.getSecurityConfig.mockReturnValue({
        auditLog: { enabled: false, logEvents: {} },
      });

      const entry = logger.log('login', '192.168.1.1', true);

      expect(entry).toBeNull();
      expect(mockDataStore.addAuditEntry).not.toHaveBeenCalled();
    });

    it('should return null when event type is disabled', () => {
      mockDataStore.getSecurityConfig.mockReturnValue({
        auditLog: {
          enabled: true,
          logEvents: { login: false },
        },
      });

      const entry = logger.log('login', '192.168.1.1', true);

      expect(entry).toBeNull();
    });

    it('should log to console based on log level', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockDataStore.getSecurityConfig.mockReturnValue({
        auditLog: {
          enabled: true,
          level: 'debug',
          logEvents: { login: true },
        },
      });

      logger.log('login', '192.168.1.1', true);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('logLogin', () => {
    it('should log a successful login', () => {
      logger.logLogin('192.168.1.1', 'sess-123', 'Mozilla/5.0');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'login',
          ip: '192.168.1.1',
          success: true,
          sessionId: 'sess-123',
          details: 'User-Agent: Mozilla/5.0',
        })
      );
    });

    it('should log login without user agent', () => {
      logger.logLogin('192.168.1.1', 'sess-123');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'login',
          details: undefined,
        })
      );
    });
  });

  describe('logFailedLogin', () => {
    it('should log a failed login attempt', () => {
      logger.logFailedLogin('192.168.1.1', 'Invalid password');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'failed_login',
          ip: '192.168.1.1',
          success: false,
          details: 'Invalid password',
        })
      );
    });
  });

  describe('logLogout', () => {
    it('should log a logout', () => {
      logger.logLogout('192.168.1.1', 'sess-123');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'logout',
          ip: '192.168.1.1',
          success: true,
          sessionId: 'sess-123',
        })
      );
    });
  });

  describe('logSessionKick', () => {
    it('should log a session kick', () => {
      logger.logSessionKick('192.168.1.1', 'sess-123', 'Admin kicked');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'session_kick',
          sessionId: 'sess-123',
          details: 'Admin kicked',
        })
      );
    });
  });

  describe('logInstanceCreate', () => {
    it('should log instance creation', () => {
      logger.logInstanceCreate('192.168.1.1', 'inst-123', 'proj-456');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'instance_create',
          details: 'Instance: inst-123, Project: proj-456',
        })
      );
    });
  });

  describe('logInstanceKill', () => {
    it('should log instance kill', () => {
      logger.logInstanceKill('192.168.1.1', 'inst-123');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'instance_kill',
          details: 'Instance: inst-123',
        })
      );
    });
  });

  describe('logConfigChange', () => {
    it('should log config change with details', () => {
      logger.logConfigChange('192.168.1.1', 'security', 'Enabled 2FA');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'config_change',
          details: 'security: Enabled 2FA',
        })
      );
    });

    it('should log config change without details', () => {
      logger.logConfigChange('192.168.1.1', 'general');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'config_change',
          details: 'general',
        })
      );
    });
  });

  describe('logIpBlocked', () => {
    it('should log IP block', () => {
      logger.logIpBlocked('10.0.0.1', 'Too many failed attempts', '192.168.1.1');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_blocked',
          ip: '10.0.0.1',
          details: 'Too many failed attempts (triggered by: 192.168.1.1)',
        })
      );
    });

    it('should log IP block without trigger', () => {
      logger.logIpBlocked('10.0.0.1', 'Manual block');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          details: 'Manual block',
        })
      );
    });
  });

  describe('logIpUnblocked', () => {
    it('should log IP unblock', () => {
      logger.logIpUnblocked('10.0.0.1', '192.168.1.1');

      expect(mockDataStore.addAuditEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_unblocked',
          ip: '10.0.0.1',
          details: 'Unblocked by: 192.168.1.1',
        })
      );
    });
  });

  describe('getEntries', () => {
    it('should return audit log entries', () => {
      const mockEntries = [
        { id: '1', event: 'login', ip: '192.168.1.1' },
        { id: '2', event: 'logout', ip: '192.168.1.1' },
      ];
      mockDataStore.getAuditLog.mockReturnValue(mockEntries);

      const entries = logger.getEntries();

      expect(entries).toEqual(mockEntries);
    });

    it('should pass query options', () => {
      mockDataStore.getAuditLog.mockReturnValue([]);

      const options = { limit: 10, event: 'login' };
      logger.getEntries(options as never);

      expect(mockDataStore.getAuditLog).toHaveBeenCalledWith(options);
    });
  });

  describe('getCount', () => {
    it('should return audit log count', () => {
      mockDataStore.getAuditLogCount.mockReturnValue(42);

      const count = logger.getCount();

      expect(count).toBe(42);
    });
  });

  describe('clear', () => {
    it('should clear audit log', () => {
      logger.clear();

      expect(mockDataStore.clearAuditLog).toHaveBeenCalled();
    });
  });

  describe('cleanup interval', () => {
    it('should run cleanup on interval', () => {
      // Clear calls from initialization
      mockDataStore.cleanupAuditLog.mockClear();

      mockDataStore.getSecurityConfig.mockReturnValue({
        auditLog: {
          enabled: true,
          retentionDays: 30,
          logEvents: {},
        },
      });
      mockDataStore.cleanupAuditLog.mockReturnValue(5);

      // Advance 24 hours to trigger cleanup
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      expect(mockDataStore.cleanupAuditLog).toHaveBeenCalledWith(30);
    });

    it('should not cleanup when retention is 0', () => {
      // Create a fresh logger with retention set to 0
      logger.destroy();
      mockDataStore.getSecurityConfig.mockReturnValue({
        auditLog: {
          enabled: true,
          retentionDays: 0,
          logEvents: {},
        },
      });
      mockDataStore.cleanupAuditLog.mockClear();

      logger = AuditLogger.getInstance();

      // The initial cleanup should be skipped due to retention being 0
      // Advance 24 hours
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);

      // With retention 0, cleanup should not be called
      expect(mockDataStore.cleanupAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should stop cleanup interval', () => {
      logger.destroy();

      // Advance time and verify no more cleanup calls
      mockDataStore.cleanupAuditLog.mockClear();
      vi.advanceTimersByTime(48 * 60 * 60 * 1000);

      expect(mockDataStore.cleanupAuditLog).not.toHaveBeenCalled();
    });
  });
});
