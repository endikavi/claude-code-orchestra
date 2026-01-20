import { Router, Request, Response, NextFunction } from 'express';
import { getAuthService } from '../AuthService';
import { getAuditLogger } from '../AuditLogger';
import { DataStore } from '../DataStore';
import type {
  LoginRequest,
  LoginResponse,
  RemoteSession,
  TokenPayload,
} from '@shared/types/remote';
import { EventEmitter } from 'events';

// Extend Express Request to include session info
export interface AuthenticatedRequest extends Request {
  session?: RemoteSession;
  tokenPayload?: TokenPayload;
}

export interface AuthRoutesDeps {
  ipAccessMiddleware: (req: Request, res: Response, next: NextFunction) => void;
  authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  emitter: EventEmitter;
}

export function createAuthRoutes(deps: AuthRoutesDeps): Router {
  const router = Router();
  const authService = getAuthService();
  const dataStore = DataStore.getInstance();
  const auditLogger = getAuditLogger();

  // Login endpoint with IP access control
  router.post('/login', deps.ipAccessMiddleware, (req: Request, res: Response) => {
    const { password } = req.body as LoginRequest;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Check rate limit (uses configurable settings from security config)
    if (authService.isRateLimited(ip)) {
      const lockout = authService.getIpLockout(ip);
      const remaining = lockout ? Math.ceil((lockout.expiresAt - Date.now()) / 60000) : 0;

      auditLogger.logFailedLogin(ip, 'Rate limited');

      const response: LoginResponse = {
        success: false,
        error:
          remaining > 0
            ? `Too many attempts. Try again in ${remaining} minutes.`
            : 'Too many attempts. Try again later.',
      };
      res.status(429).json(response);
      return;
    }

    // Get remote config from datastore
    const config = dataStore.getRemoteConfig();
    if (!config || !config.passwordHash) {
      const response: LoginResponse = { success: false, error: 'Remote access not configured' };
      res.status(403).json(response);
      return;
    }

    // Verify password
    if (!authService.verifyPassword(password, config.passwordHash)) {
      // Record failed attempt for rate limiting
      const { shouldLockout, attempts } = authService.recordFailedAttempt(ip);
      const securityConfig = authService.getSecurityConfig();

      auditLogger.logFailedLogin(ip, `Invalid password (attempt ${attempts})`);

      const response: LoginResponse = {
        success: false,
        error: shouldLockout
          ? `Too many failed attempts. IP locked for ${securityConfig.rateLimit.lockoutMinutes} minutes.`
          : 'Invalid password',
      };
      res.status(401).json(response);
      return;
    }

    // Check max concurrent sessions before creating new session
    const sessionCheck = authService.canCreateSession(ip);
    if (!sessionCheck.allowed) {
      auditLogger.logFailedLogin(ip, sessionCheck.reason || 'Max sessions reached');
      const response: LoginResponse = { success: false, error: sessionCheck.reason };
      res.status(403).json(response);
      return;
    }

    // Reset rate limit on successful login
    authService.resetRateLimit(ip);

    // Create session and generate token
    const userAgent = req.headers['user-agent'] || 'unknown';
    const session = authService.createSession(ip, userAgent);
    const token = authService.generateToken(session.id, ip);

    // Log successful login
    auditLogger.logLogin(ip, session.id, userAgent);

    const response: LoginResponse = { success: true, token };
    res.json(response);

    // Emit event for session tracking
    deps.emitter.emit('session:created', session);
  });

  // Logout endpoint
  router.post('/logout', deps.authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (req.tokenPayload) {
      authService.deleteSession(req.tokenPayload.sessionId);
      deps.emitter.emit('session:deleted', req.tokenPayload.sessionId);

      // Log logout
      auditLogger.logLogout(ip, req.tokenPayload.sessionId);
    }
    res.json({ success: true });
  });

  // Get current user session
  router.get('/me', deps.authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    res.json({ success: true, data: req.session });
  });

  return router;
}
