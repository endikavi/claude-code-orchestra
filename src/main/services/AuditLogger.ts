import { DataStore } from './DataStore';
import type { AuditEventType, AuditLogEntry, AuditLogQueryOptions } from '@shared/types';

// Cleanup interval for audit log (24 hours)
const AUDIT_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

export class AuditLogger {
  private static instance: AuditLogger | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startCleanupInterval();
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Start periodic cleanup of old audit log entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
    }, AUDIT_CLEANUP_INTERVAL);

    // Run initial cleanup
    this.cleanupOldEntries();
  }

  /**
   * Stop the cleanup interval
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    AuditLogger.instance = null;
  }

  /**
   * Check if a specific event type should be logged
   */
  private shouldLogEvent(event: AuditEventType): boolean {
    const dataStore = DataStore.getInstance();
    const config = dataStore.getSecurityConfig();

    if (!config.auditLog.enabled) {
      return false;
    }

    const eventMapping: Record<AuditEventType, keyof typeof config.auditLog.logEvents | null> = {
      login: 'login',
      logout: 'logout',
      failed_login: 'failedLogin',
      session_kick: 'sessionKick',
      instance_create: 'instanceCreate',
      instance_kill: 'instanceKill',
      config_change: 'configChange',
      ip_blocked: 'failedLogin', // Log IP blocks with failed login setting
      ip_unblocked: 'configChange', // Log IP unblocks with config change setting
    };

    const logEventKey = eventMapping[event];
    if (!logEventKey) {
      return true; // Log unknown events by default
    }

    return config.auditLog.logEvents[logEventKey];
  }

  /**
   * Log an audit event
   */
  public log(
    event: AuditEventType,
    ip: string,
    success: boolean,
    options: { sessionId?: string; details?: string } = {}
  ): AuditLogEntry | null {
    if (!this.shouldLogEvent(event)) {
      return null;
    }

    const dataStore = DataStore.getInstance();

    const entry = dataStore.addAuditEntry({
      event,
      ip,
      success,
      sessionId: options.sessionId,
      details: options.details,
    });

    // Log to console based on level
    const config = dataStore.getSecurityConfig();
    const logLevel = config.auditLog.level;

    const shouldConsoleLog =
      logLevel === 'debug' ||
      (logLevel === 'info' && (event !== 'login' || !success)) ||
      (logLevel === 'warn' && !success) ||
      (logLevel === 'error' && !success && (event === 'failed_login' || event === 'ip_blocked'));

    if (shouldConsoleLog) {
      const status = success ? 'SUCCESS' : 'FAILED';
      console.log(
        `[AuditLog] ${event} - ${status} - IP: ${ip}${options.details ? ` - ${options.details}` : ''}`
      );
    }

    return entry;
  }

  /**
   * Log a successful login
   */
  public logLogin(ip: string, sessionId: string, userAgent?: string): void {
    this.log('login', ip, true, {
      sessionId,
      details: userAgent ? `User-Agent: ${userAgent}` : undefined,
    });
  }

  /**
   * Log a failed login attempt
   */
  public logFailedLogin(ip: string, reason: string): void {
    this.log('failed_login', ip, false, {
      details: reason,
    });
  }

  /**
   * Log a logout
   */
  public logLogout(ip: string, sessionId: string): void {
    this.log('logout', ip, true, {
      sessionId,
    });
  }

  /**
   * Log a session kick
   */
  public logSessionKick(ip: string, sessionId: string, reason: string): void {
    this.log('session_kick', ip, true, {
      sessionId,
      details: reason,
    });
  }

  /**
   * Log an instance creation
   */
  public logInstanceCreate(ip: string, instanceId: string, projectId: string): void {
    this.log('instance_create', ip, true, {
      details: `Instance: ${instanceId}, Project: ${projectId}`,
    });
  }

  /**
   * Log an instance kill
   */
  public logInstanceKill(ip: string, instanceId: string): void {
    this.log('instance_kill', ip, true, {
      details: `Instance: ${instanceId}`,
    });
  }

  /**
   * Log a configuration change
   */
  public logConfigChange(ip: string, configType: string, details?: string): void {
    this.log('config_change', ip, true, {
      details: details ? `${configType}: ${details}` : configType,
    });
  }

  /**
   * Log an IP block
   */
  public logIpBlocked(blockedIp: string, reason: string, triggeredBy?: string): void {
    this.log('ip_blocked', blockedIp, true, {
      details: `${reason}${triggeredBy ? ` (triggered by: ${triggeredBy})` : ''}`,
    });
  }

  /**
   * Log an IP unblock
   */
  public logIpUnblocked(unblockedIp: string, adminIp: string): void {
    this.log('ip_unblocked', unblockedIp, true, {
      details: `Unblocked by: ${adminIp}`,
    });
  }

  /**
   * Get audit log entries
   */
  public getEntries(options: AuditLogQueryOptions = {}): AuditLogEntry[] {
    const dataStore = DataStore.getInstance();
    return dataStore.getAuditLog(options);
  }

  /**
   * Get audit log entry count
   */
  public getCount(): number {
    const dataStore = DataStore.getInstance();
    return dataStore.getAuditLogCount();
  }

  /**
   * Clean up old entries based on retention policy
   */
  private cleanupOldEntries(): void {
    const dataStore = DataStore.getInstance();
    const config = dataStore.getSecurityConfig();

    if (config.auditLog.retentionDays > 0) {
      const deleted = dataStore.cleanupAuditLog(config.auditLog.retentionDays);
      if (deleted > 0) {
        console.log(`[AuditLogger] Cleaned up ${deleted} old audit log entries`);
      }
    }
  }

  /**
   * Clear all audit log entries
   */
  public clear(): void {
    const dataStore = DataStore.getInstance();
    dataStore.clearAuditLog();
  }
}

// Export singleton getter
export function getAuditLogger(): AuditLogger {
  return AuditLogger.getInstance();
}
