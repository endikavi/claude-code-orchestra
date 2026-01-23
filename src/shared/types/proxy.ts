/**
 * Proxy Types
 *
 * Types for the web proxy tunnel feature that allows viewing
 * apps running on the host through the WebSocket connection.
 */

/**
 * Proxy service configuration stored in database
 */
export interface ProxyConfig {
  enabled: boolean;
  maxConcurrentTunnels: number;
  rateLimitPerMinute: number;
}

/**
 * Default proxy configuration
 */
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  maxConcurrentTunnels: 5,
  rateLimitPerMinute: 100,
};

/**
 * Allowed port entry for whitelist
 */
export interface AllowedPort {
  id: string;
  port: number;
  description?: string;
  createdAt: number;
}

/**
 * Active proxy view in the UI
 */
export interface ProxyView {
  id: string;
  port: number;
  path: string;
  title?: string;
  instanceId?: string; // Associated instance for split view
  createdAt: number;
}

/**
 * DevTools state for a proxy view (stored separately in the store)
 */
export interface ProxyViewDevToolsState {
  inspectorEnabled: boolean;
  consolePanelOpen: boolean;
  consoleFilter: import('./devtools').ConsoleLevel | null;
}

/**
 * Parameters for preview_open MCP tool
 */
export interface PreviewOpenParams {
  port: number;
  path?: string;
  split?: boolean;
  title?: string;
}

/**
 * Proxy request tracking for rate limiting
 */
export interface ProxyRequestInfo {
  sessionId: string;
  timestamp: number;
  port: number;
  path: string;
}

/**
 * Common development ports with descriptions
 */
export const COMMON_DEV_PORTS: Array<{ port: number; description: string }> = [
  { port: 3000, description: 'React/Node.js default' },
  { port: 3001, description: 'React alternate' },
  { port: 4000, description: 'GraphQL/Apollo' },
  { port: 4200, description: 'Angular default' },
  { port: 5000, description: 'Flask/ASP.NET' },
  { port: 5173, description: 'Vite default' },
  { port: 5174, description: 'Vite alternate' },
  { port: 8000, description: 'Django/Python' },
  { port: 8080, description: 'HTTP alternate/Tomcat' },
  { port: 8081, description: 'HTTP alternate' },
  { port: 8888, description: 'Jupyter Notebook' },
  { port: 9000, description: 'PHP/SonarQube' },
];
