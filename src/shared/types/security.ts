// IP Access Control
export interface IpAccessRule {
  id: string;
  type: 'allow' | 'deny';
  value: string; // IP, CIDR (e.g., 192.168.1.0/24), or pattern
  description?: string;
  createdAt: number;
}

export interface IpAccessConfig {
  enabled: boolean;
  mode: 'allowlist' | 'denylist';
  rules: IpAccessRule[];
}

// Configurable Authentication
export interface AuthConfig {
  tokenExpirationHours: number; // Default: 24
  maxConcurrentSessions: number; // Default: 0 (unlimited)
  inactivityTimeoutMinutes: number; // Default: 0 (disabled)
}

// Configurable Rate Limiting
export interface RateLimitConfig {
  enabled: boolean;
  maxAttempts: number; // Default: 5
  windowMinutes: number; // Default: 1
  lockoutMinutes: number; // Default: 15
  lockoutEnabled: boolean;
}

// Audit Log Event Types
export type AuditEventType =
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'session_kick'
  | 'instance_create'
  | 'instance_kill'
  | 'config_change'
  | 'ip_blocked'
  | 'ip_unblocked';

// Audit Log Configuration
export interface AuditLogConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  retentionDays: number;
  logEvents: {
    login: boolean;
    logout: boolean;
    failedLogin: boolean;
    sessionKick: boolean;
    instanceCreate: boolean;
    instanceKill: boolean;
    configChange: boolean;
  };
}

// Audit Log Entry
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  event: AuditEventType;
  ip: string;
  sessionId?: string;
  details?: string;
  success: boolean;
}

// Complete Security Configuration
export interface SecurityConfig {
  ipAccess: IpAccessConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  auditLog: AuditLogConfig;
}

// Default Security Configuration
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  ipAccess: {
    enabled: false,
    mode: 'allowlist',
    rules: [],
  },
  auth: {
    tokenExpirationHours: 24,
    maxConcurrentSessions: 0, // Unlimited
    inactivityTimeoutMinutes: 0, // Disabled
  },
  rateLimit: {
    enabled: true,
    maxAttempts: 5,
    windowMinutes: 1,
    lockoutMinutes: 15,
    lockoutEnabled: true,
  },
  auditLog: {
    enabled: false,
    level: 'info',
    retentionDays: 30,
    logEvents: {
      login: true,
      logout: true,
      failedLogin: true,
      sessionKick: true,
      instanceCreate: false,
      instanceKill: false,
      configChange: true,
    },
  },
};

// IP Lockout Entry (for rate limiting)
export interface IpLockoutEntry {
  ip: string;
  lockedAt: number;
  expiresAt: number;
  attempts: number;
}

// Audit Log Query Options
export interface AuditLogQueryOptions {
  startDate?: number;
  endDate?: number;
  eventTypes?: AuditEventType[];
  ip?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}
