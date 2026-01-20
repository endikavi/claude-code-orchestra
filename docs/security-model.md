# Security Model

This document describes the security architecture of Claude Code Orchestra, including authentication, authorization, and audit logging.

## Overview

Claude Code Orchestra implements multiple security layers:

1. **Authentication** - Password-based login with JWT tokens
2. **Session Management** - Configurable session limits and timeouts
3. **IP Access Control** - Allowlist/denylist IP filtering
4. **Rate Limiting** - Protection against brute-force attacks
5. **Audit Logging** - Security event tracking
6. **Permission Control** - Tool execution permissions

## Authentication

### Password Hashing

Passwords are hashed using bcrypt with a work factor of 10:

```typescript
// Hashing (during password setup)
const hash = bcrypt.hashSync(password, 10);

// Verification (during login)
const isValid = bcrypt.compareSync(password, storedHash);
```

### JWT Tokens

Authentication uses JWT tokens with:
- **Secret**: 256-bit random secret (generated on first run, stored in database)
- **Expiration**: Configurable (default: 24 hours)
- **Payload**: Session ID and IP address

```typescript
interface TokenPayload {
  sessionId: string;
  ip: string;
  iat: number;
  exp: number;
}
```

### Session Management

Sessions are managed in-memory with persistence to database:

```typescript
interface RemoteSession {
  id: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  lastActivity: number;
}
```

**Configurable Limits:**
- `maxConcurrentSessions`: Maximum active sessions (default: 5)
- `sessionTimeoutMinutes`: Inactivity timeout (default: 60)

## IP Access Control

### Modes

Two modes are available:

1. **Allowlist** - Only explicitly allowed IPs can connect
2. **Denylist** - All IPs allowed except explicitly denied

### Rule Formats

IP rules support multiple formats:

```
# Exact IP
192.168.1.100

# CIDR notation
192.168.1.0/24

# Wildcard
192.168.1.*
```

### Configuration

```typescript
interface IpAccessConfig {
  enabled: boolean;
  mode: 'allowlist' | 'denylist';
}
```

## Rate Limiting

Protection against brute-force authentication attacks:

```typescript
interface RateLimitConfig {
  maxAttempts: number;        // Max failed attempts (default: 5)
  windowMinutes: number;      // Time window for counting (default: 15)
  lockoutMinutes: number;     // Lockout duration (default: 30)
}
```

### Behavior

1. Failed login attempts are counted per IP
2. After `maxAttempts` failures within `windowMinutes`, IP is locked
3. Lockout lasts for `lockoutMinutes`
4. Successful login resets the counter

## Audit Logging

Security events are logged to SQLite database:

### Event Types

| Event | Description |
|-------|-------------|
| `login` | Successful authentication |
| `failed_login` | Authentication failure |
| `logout` | User logout |
| `session_kick` | Admin terminated session |
| `remote_enabled` | Remote access enabled |
| `remote_disabled` | Remote access disabled |
| `password_changed` | Password updated |
| `ip_rule_added` | IP rule created |
| `ip_rule_removed` | IP rule deleted |

### Log Entry Structure

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: number;
  event: string;
  ip: string;
  success: boolean;
  details?: string;
}
```

### Query API

```typescript
// Get recent logs
const logs = dataStore.getAuditLogs({
  limit: 100,
  eventTypes: ['login', 'failed_login'],
  startTime: Date.now() - 86400000, // Last 24 hours
});
```

## Permission System

### Tool Execution Permissions

The PermissionManager controls which tools Claude can execute:

```typescript
interface PermissionRule {
  id: string;
  projectId?: string;  // null = global rule
  toolName: string;
  decision: 'allow' | 'deny' | 'ask';
  conditions?: Record<string, unknown>;
}
```

### Hook Integration

The dashboard integrates with Claude's hook system:

1. **Pre-tool hook**: Dashboard checks permission before tool execution
2. **Post-tool hook**: Dashboard records tool usage for metrics

### Default Behaviors

- Read-only tools (`Read`, `Glob`, `Grep`): Generally allowed
- Write tools (`Write`, `Edit`): Require permission or auto-allow in project
- System tools (`Bash`): Subject to project settings

## Environment Variable Security

### Filtered Environment

Claude instances receive a filtered environment to prevent credential leakage:

**Allowed Variables:**
- System essentials: `PATH`, `HOME`, `SHELL`, `TERM`
- Windows-specific: `USERPROFILE`, `APPDATA`, `SystemRoot`
- Node.js paths: `NODE_PATH`, `npm_config_prefix`
- Claude-specific: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_*`

**Blocked Variables:**
- Cloud credentials: `AWS_*`, `GOOGLE_*`, `AZURE_*`
- Database credentials: `DATABASE_URL`, `DB_*`
- API keys (except Anthropic): `*_API_KEY`, `*_SECRET`

## Web Server Security

### CORS Configuration

CORS is configured to allow:
- localhost origins
- Local network IP
- Custom hostname (if configured)
- All origins (if `allowAnyCors` enabled - development only)

### Security Headers

All responses include security headers:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### Socket.IO Authentication

WebSocket connections require valid JWT token:

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const payload = authService.verifyToken(token);
  if (!payload) {
    return next(new Error('Invalid token'));
  }
  next();
});
```

## Best Practices

### Password Requirements

Recommended password policy (enforced client-side):
- Minimum 8 characters
- Mix of uppercase, lowercase, numbers
- Avoid common patterns

### Session Security

- Sessions are invalidated on password change
- Admin can kick active sessions
- Sessions timeout after inactivity

### Network Security

- Use HTTPS with reverse proxy for production
- Consider VPN for remote access
- Enable IP allowlist for known clients

### Monitoring

- Regularly review audit logs
- Alert on multiple failed login attempts
- Monitor for unusual access patterns

## Configuration Reference

### Security Config Schema

```typescript
interface SecurityConfig {
  rateLimit: {
    maxAttempts: number;
    windowMinutes: number;
    lockoutMinutes: number;
  };
  session: {
    maxConcurrent: number;
    timeoutMinutes: number;
  };
  ipAccess: {
    enabled: boolean;
    mode: 'allowlist' | 'denylist';
  };
}
```

### Default Configuration

```typescript
const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  rateLimit: {
    maxAttempts: 5,
    windowMinutes: 15,
    lockoutMinutes: 30,
  },
  session: {
    maxConcurrent: 5,
    timeoutMinutes: 60,
  },
  ipAccess: {
    enabled: false,
    mode: 'denylist',
  },
};
```
