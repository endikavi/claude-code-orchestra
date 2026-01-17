import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { TokenPayload, RemoteSession } from '@shared/types/remote';
import type { RateLimitConfig, SecurityConfig } from '@shared/types';
import { DataStore } from './DataStore';
import { getAuditLogger } from './AuditLogger';

// Rate limiting storage (in-memory for fast access)
interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
}

// Session cleanup interval (1 hour)
const SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000;

// Inactivity check interval (1 minute)
const INACTIVITY_CHECK_INTERVAL = 60 * 1000;

export class AuthService {
  private static instance: AuthService | null = null;
  private sessions: Map<string, RemoteSession> = new Map();
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private jwtSecret: string;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private inactivityInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Get or create persistent JWT secret from database
    const dataStore = DataStore.getInstance();
    this.jwtSecret = dataStore.getOrCreateJwtSecret();

    // Start session cleanup interval
    this.startSessionCleanup();

    // Start inactivity check interval
    this.startInactivityCheck();
  }

  /**
   * Start periodic session cleanup
   */
  private startSessionCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL);
  }

  /**
   * Start periodic inactivity check
   */
  private startInactivityCheck(): void {
    this.inactivityInterval = setInterval(() => {
      this.checkInactiveSessions();
    }, INACTIVITY_CHECK_INTERVAL);
  }

  /**
   * Check and remove inactive sessions based on config
   */
  private checkInactiveSessions(): void {
    const dataStore = DataStore.getInstance();
    const config = dataStore.getSecurityConfig();

    if (config.auth.inactivityTimeoutMinutes <= 0) {
      return; // Inactivity timeout disabled
    }

    const timeoutMs = config.auth.inactivityTimeoutMinutes * 60 * 1000;
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > timeoutMs) {
        this.sessions.delete(id);
        console.log(`[AuthService] Session ${id} removed due to inactivity`);

        // Log to audit
        getAuditLogger().logSessionKick(session.ip, id, 'Inactivity timeout');
      }
    }
  }

  /**
   * Stop session cleanup and clean up resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.inactivityInterval) {
      clearInterval(this.inactivityInterval);
      this.inactivityInterval = null;
    }
  }

  /**
   * Get current security configuration
   */
  public getSecurityConfig(): SecurityConfig {
    const dataStore = DataStore.getInstance();
    return dataStore.getSecurityConfig();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Hash a password using bcrypt
   */
  hashPassword(password: string): string {
    const salt = bcrypt.genSaltSync(10);
    return bcrypt.hashSync(password, salt);
  }

  /**
   * Verify a password against a hash
   */
  verifyPassword(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash);
  }

  /**
   * Check if IP is locked out (persistent DB-based lockout)
   */
  isIpLocked(ip: string): boolean {
    const dataStore = DataStore.getInstance();
    return dataStore.isIpLocked(ip);
  }

  /**
   * Get lockout info for an IP
   */
  getIpLockout(ip: string): { lockedAt: number; expiresAt: number; attempts: number } | null {
    const dataStore = DataStore.getInstance();
    return dataStore.getIpLockout(ip);
  }

  /**
   * Lock an IP address
   */
  lockIp(ip: string): void {
    const config = this.getSecurityConfig();
    const dataStore = DataStore.getInstance();
    const entry = this.rateLimits.get(ip);

    dataStore.lockIp(ip, config.rateLimit.lockoutMinutes, entry?.attempts || 0);

    // Log to audit
    getAuditLogger().logIpBlocked(ip, 'Rate limit exceeded');
  }

  /**
   * Unlock an IP address
   */
  unlockIp(ip: string, adminIp?: string): void {
    const dataStore = DataStore.getInstance();
    dataStore.unlockIp(ip);
    this.rateLimits.delete(ip);

    // Log to audit
    if (adminIp) {
      getAuditLogger().logIpUnblocked(ip, adminIp);
    }
  }

  /**
   * Check rate limit for an IP
   * Returns true if the request should be blocked
   */
  isRateLimited(ip: string, config?: RateLimitConfig): boolean {
    const securityConfig = this.getSecurityConfig();
    const rateLimitConfig = config || securityConfig.rateLimit;

    // Check if rate limiting is enabled
    if (!rateLimitConfig.enabled) {
      return false;
    }

    // First check if IP is already locked out
    if (rateLimitConfig.lockoutEnabled && this.isIpLocked(ip)) {
      return true;
    }

    const now = Date.now();
    const windowMs = rateLimitConfig.windowMinutes * 60 * 1000;
    const entry = this.rateLimits.get(ip);

    if (!entry) {
      this.rateLimits.set(ip, { attempts: 1, firstAttempt: now });
      return false;
    }

    // Check if window has expired
    if (now - entry.firstAttempt > windowMs) {
      this.rateLimits.set(ip, { attempts: 1, firstAttempt: now });
      return false;
    }

    // Increment attempts
    entry.attempts++;

    // Check if over limit
    if (entry.attempts > rateLimitConfig.maxAttempts) {
      // Apply lockout if enabled
      if (rateLimitConfig.lockoutEnabled) {
        this.lockIp(ip);
      }
      return true;
    }

    return false;
  }

  /**
   * Record a failed login attempt (for rate limiting)
   */
  recordFailedAttempt(ip: string): { shouldLockout: boolean; attempts: number } {
    const config = this.getSecurityConfig();

    if (!config.rateLimit.enabled) {
      return { shouldLockout: false, attempts: 0 };
    }

    const now = Date.now();
    const windowMs = config.rateLimit.windowMinutes * 60 * 1000;
    let entry = this.rateLimits.get(ip);

    if (!entry || now - entry.firstAttempt > windowMs) {
      entry = { attempts: 1, firstAttempt: now };
      this.rateLimits.set(ip, entry);
    } else {
      entry.attempts++;
    }

    const shouldLockout =
      config.rateLimit.lockoutEnabled && entry.attempts >= config.rateLimit.maxAttempts;

    if (shouldLockout) {
      this.lockIp(ip);
    }

    return { shouldLockout, attempts: entry.attempts };
  }

  /**
   * Reset rate limit for an IP (after successful login)
   */
  resetRateLimit(ip: string): void {
    this.rateLimits.delete(ip);
  }

  /**
   * Check if a new session can be created (max concurrent sessions check)
   */
  canCreateSession(ip: string): { allowed: boolean; reason?: string } {
    const config = this.getSecurityConfig();

    // Check if max concurrent sessions is limited
    if (config.auth.maxConcurrentSessions > 0) {
      // Count sessions from this IP
      let sessionCount = 0;
      for (const session of this.sessions.values()) {
        if (session.ip === ip) {
          sessionCount++;
        }
      }

      if (sessionCount >= config.auth.maxConcurrentSessions) {
        return {
          allowed: false,
          reason: `Maximum concurrent sessions (${config.auth.maxConcurrentSessions}) reached for this IP`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get sessions count by IP
   */
  getSessionCountByIp(ip: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.ip === ip) {
        count++;
      }
    }
    return count;
  }

  /**
   * Generate a JWT token for a session
   * Uses configurable expiration from security config
   */
  generateToken(sessionId: string, ip: string, expirationHours?: number): string {
    const config = this.getSecurityConfig();
    const hours = expirationHours ?? config.auth.tokenExpirationHours;

    const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
      sessionId,
      ip,
    };

    return jwt.sign(payload, this.jwtSecret, { expiresIn: `${hours}h` });
  }

  /**
   * Verify a JWT token and return its payload
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return payload;
    } catch (error) {
      // Log verification failures for security monitoring
      console.warn(
        '[AuthService] Token verification failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  /**
   * Create a new session
   */
  createSession(ip: string, userAgent: string): RemoteSession {
    const session: RemoteSession = {
      id: randomUUID(),
      ip,
      userAgent,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): RemoteSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Update session activity timestamp
   */
  updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): RemoteSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Clean up expired sessions (called periodically)
   */
  cleanupExpiredSessions(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > maxAge) {
        this.sessions.delete(id);
      }
    }
  }
}

// Export singleton getter
export function getAuthService(): AuthService {
  return AuthService.getInstance();
}
