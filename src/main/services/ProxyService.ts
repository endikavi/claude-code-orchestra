import { DataStore } from './DataStore';
import type { ProxyConfig, AllowedPort, ProxyRequestInfo } from '@shared/types';

/**
 * Minimum allowed port (block system ports)
 */
const MIN_ALLOWED_PORT = 1024;

/**
 * Maximum allowed port
 */
const MAX_ALLOWED_PORT = 65535;

/**
 * ProxyService handles HTTP proxy requests to localhost ports
 *
 * Security features:
 * - Port whitelist: Only explicitly allowed ports can be proxied
 * - Rate limiting: Per-session request limits
 * - Only localhost: Never proxy to external IPs
 * - System port blocking: Ports < 1024 are blocked by default
 */
export class ProxyService {
  private static instance: ProxyService | null = null;
  private requestHistory: Map<string, ProxyRequestInfo[]> = new Map();

  private constructor(private dataStore: DataStore) {}

  public static getInstance(): ProxyService {
    if (!ProxyService.instance) {
      ProxyService.instance = new ProxyService(DataStore.getInstance());
    }
    return ProxyService.instance;
  }

  /**
   * Get proxy configuration
   */
  public getConfig(): ProxyConfig {
    return this.dataStore.getProxyConfig();
  }

  /**
   * Update proxy configuration
   */
  public updateConfig(config: Partial<ProxyConfig>): ProxyConfig {
    return this.dataStore.updateProxyConfig(config);
  }

  /**
   * Get all allowed ports
   */
  public getAllowedPorts(): AllowedPort[] {
    return this.dataStore.getAllowedPorts();
  }

  /**
   * Add an allowed port
   */
  public addAllowedPort(port: number, description?: string): AllowedPort | { error: string } {
    // Validate port range
    if (port < MIN_ALLOWED_PORT || port > MAX_ALLOWED_PORT) {
      return { error: `Port must be between ${MIN_ALLOWED_PORT} and ${MAX_ALLOWED_PORT}` };
    }

    // Check if port is already allowed
    if (this.dataStore.isPortAllowed(port)) {
      return { error: `Port ${port} is already allowed` };
    }

    return this.dataStore.addAllowedPort(port, description);
  }

  /**
   * Remove an allowed port
   */
  public removeAllowedPort(port: number): void {
    this.dataStore.deleteAllowedPort(port);
  }

  /**
   * Check if a port is allowed for proxying
   */
  public isPortAllowed(port: number): boolean {
    // Block system ports
    if (port < MIN_ALLOWED_PORT || port > MAX_ALLOWED_PORT) {
      return false;
    }

    return this.dataStore.isPortAllowed(port);
  }

  /**
   * Check if proxy is enabled
   */
  public isEnabled(): boolean {
    return this.getConfig().enabled;
  }

  /**
   * Check rate limit for a session
   */
  public checkRateLimit(sessionId: string): boolean {
    const config = this.getConfig();
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    // Get request history for session
    const history = this.requestHistory.get(sessionId) || [];

    // Filter to requests within the window
    const recentRequests = history.filter((req) => now - req.timestamp < windowMs);

    // Check if under limit
    return recentRequests.length < config.rateLimitPerMinute;
  }

  /**
   * Record a proxy request for rate limiting
   */
  public recordRequest(sessionId: string, port: number, path: string): void {
    const history = this.requestHistory.get(sessionId) || [];
    const now = Date.now();

    // Add new request
    history.push({
      sessionId,
      timestamp: now,
      port,
      path,
    });

    // Clean old requests (older than 1 minute)
    const windowMs = 60000;
    const filtered = history.filter((req) => now - req.timestamp < windowMs);

    this.requestHistory.set(sessionId, filtered);
  }

  /**
   * Get rate limit status for a session
   */
  public getRateLimitStatus(sessionId: string): {
    current: number;
    limit: number;
    remaining: number;
  } {
    const config = this.getConfig();
    const now = Date.now();
    const windowMs = 60000;

    const history = this.requestHistory.get(sessionId) || [];
    const recentRequests = history.filter((req) => now - req.timestamp < windowMs);

    return {
      current: recentRequests.length,
      limit: config.rateLimitPerMinute,
      remaining: Math.max(0, config.rateLimitPerMinute - recentRequests.length),
    };
  }

  /**
   * Make a proxy request to localhost
   */
  public async proxyRequest(
    port: number,
    path: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: string | Buffer;
    }
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }> {
    // Build the URL (always localhost)
    const url = `http://127.0.0.1:${port}${path}`;

    // Filter headers - remove hop-by-hop headers and host
    const filteredHeaders: Record<string, string> = {};
    const hopByHopHeaders = [
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'host',
    ];

    for (const [key, value] of Object.entries(options.headers)) {
      if (!hopByHopHeaders.includes(key.toLowerCase())) {
        filteredHeaders[key] = value;
      }
    }

    // Add forwarded headers
    filteredHeaders['X-Forwarded-For'] = '127.0.0.1';
    filteredHeaders['X-Forwarded-Proto'] = 'http';
    filteredHeaders['X-Forwarded-Host'] = `127.0.0.1:${port}`;

    try {
      // Prepare body for fetch - Buffer works directly
      const body = options.body;

      const response = await fetch(url, {
        method: options.method,
        headers: filteredHeaders,
        body: body as BodyInit | undefined,
        redirect: 'manual', // Don't follow redirects automatically
      });

      // Read response body
      const bodyBuffer = Buffer.from(await response.arrayBuffer());

      // Extract response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        // Skip hop-by-hop headers in response too
        if (!hopByHopHeaders.includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      // Rewrite Location header for redirects
      if (responseHeaders['location']) {
        const location = responseHeaders['location'];
        // If it's a relative URL or points to localhost, rewrite it
        if (
          location.startsWith('/') ||
          location.includes(`127.0.0.1:${port}`) ||
          location.includes(`localhost:${port}`)
        ) {
          responseHeaders['location'] = location
            .replace(`http://127.0.0.1:${port}`, '')
            .replace(`http://localhost:${port}`, '');
        }
      }

      return {
        status: response.status,
        headers: responseHeaders,
        body: bodyBuffer,
      };
    } catch (error) {
      // Connection errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ProxyService] Request to ${url} failed:`, errorMessage);

      throw new Error(`Failed to connect to port ${port}: ${errorMessage}`);
    }
  }

  /**
   * Clean up old request history entries
   */
  public cleanup(): void {
    const now = Date.now();
    const windowMs = 60000;

    for (const [sessionId, history] of this.requestHistory.entries()) {
      const filtered = history.filter((req) => now - req.timestamp < windowMs);
      if (filtered.length === 0) {
        this.requestHistory.delete(sessionId);
      } else {
        this.requestHistory.set(sessionId, filtered);
      }
    }
  }
}

/**
 * Get singleton ProxyService instance
 */
export function getProxyService(): ProxyService {
  return ProxyService.getInstance();
}
