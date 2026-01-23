import { Router, Request, Response, NextFunction } from 'express';
import { getProxyService } from '../ProxyService';
import { getInspectorScriptTag } from '../devtools/inspectorScript';
import type { AuthenticatedRequest } from './authRoutes';

export interface ProxyRoutesDeps {
  authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
}

/**
 * Create proxy routes for HTTP tunneling to localhost ports
 *
 * Routes:
 * - GET /api/proxy/config - Get proxy configuration
 * - PUT /api/proxy/config - Update proxy configuration
 * - GET /api/proxy/ports - List allowed ports
 * - POST /api/proxy/ports - Add allowed port
 * - DELETE /api/proxy/ports/:port - Remove allowed port
 * - ANY /api/proxy/:port/* - Proxy requests to localhost:<port>
 */
export function createProxyRoutes(deps: ProxyRoutesDeps): Router {
  const router = Router();
  const proxyService = getProxyService();

  // Get proxy configuration
  router.get('/config', deps.authMiddleware, (_req: Request, res: Response) => {
    const config = proxyService.getConfig();
    res.json({ success: true, data: config });
  });

  // Update proxy configuration
  router.put('/config', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const updates = req.body;
      const config = proxyService.updateConfig(updates);
      res.json({ success: true, data: config });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update config',
      });
    }
  });

  // List allowed ports
  router.get('/ports', deps.authMiddleware, (_req: Request, res: Response) => {
    const ports = proxyService.getAllowedPorts();
    res.json({ success: true, data: ports });
  });

  // Add allowed port
  router.post('/ports', deps.authMiddleware, (req: Request, res: Response) => {
    const { port, description } = req.body;

    if (typeof port !== 'number' || !Number.isInteger(port)) {
      res.status(400).json({ success: false, error: 'Port must be an integer' });
      return;
    }

    const result = proxyService.addAllowedPort(port, description);

    if ('error' in result) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.json({ success: true, data: result });
  });

  // Remove allowed port
  router.delete('/ports/:port', deps.authMiddleware, (req: Request, res: Response) => {
    const portParam = req.params.port;
    const port = parseInt(Array.isArray(portParam) ? portParam[0] : portParam, 10);

    if (isNaN(port)) {
      res.status(400).json({ success: false, error: 'Invalid port number' });
      return;
    }

    proxyService.removeAllowedPort(port);
    res.json({ success: true });
  });

  // Proxy endpoint - handle all HTTP methods
  // Match pattern: /api/proxy/:port/*path where *path captures the rest of the path (Express 5 / path-to-regexp v8 syntax)
  router.all(
    '/:port/*path',
    deps.authMiddleware,
    async (req: AuthenticatedRequest, res: Response) => {
      const portParam = req.params.port;
      const port = parseInt(Array.isArray(portParam) ? portParam[0] : portParam, 10);
      // Get the path after /api/proxy/:port - this is captured by the *path wildcard
      const pathParam = req.params.path;
      const targetPath = '/' + (Array.isArray(pathParam) ? pathParam.join('/') : pathParam || '');

      // Extract devtools params from query string
      const devtoolsEnabled = req.query.__devtools === '1';
      const viewId = typeof req.query.__viewId === 'string' ? req.query.__viewId : '';
      const inspectorEnabled = req.query.__inspector === '1';

      // Build query string for target without our devtools params
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (!key.startsWith('__') && typeof value === 'string') {
          queryParams.set(key, value);
        }
      }
      const targetQuery = queryParams.toString();
      const targetUrl = targetPath + (targetQuery ? '?' + targetQuery : '');

      // Validate port
      if (isNaN(port)) {
        res.status(400).json({ success: false, error: 'Invalid port number' });
        return;
      }

      // Check if proxy is enabled
      if (!proxyService.isEnabled()) {
        res.status(403).json({ success: false, error: 'Proxy is disabled' });
        return;
      }

      // Check if port is allowed
      if (!proxyService.isPortAllowed(port)) {
        res.status(403).json({
          success: false,
          error: `Port ${port} is not in the allowed list`,
        });
        return;
      }

      // Check rate limit
      const sessionId = req.session?.id || 'unknown';
      if (!proxyService.checkRateLimit(sessionId)) {
        const status = proxyService.getRateLimitStatus(sessionId);
        res.status(429).json({
          success: false,
          error: `Rate limit exceeded. ${status.remaining} requests remaining.`,
        });
        return;
      }

      // Record request for rate limiting
      proxyService.recordRequest(sessionId, port, targetPath);

      try {
        // Prepare headers
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(', ');
          }
        }

        // Get request body for non-GET requests
        let body: Buffer | undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          // Read raw body
          if (req.body) {
            // Body already parsed by express.json()
            if (typeof req.body === 'object') {
              body = Buffer.from(JSON.stringify(req.body));
            } else if (typeof req.body === 'string') {
              body = Buffer.from(req.body);
            }
          }
        }

        // Make proxy request
        const response = await proxyService.proxyRequest(port, targetUrl, {
          method: req.method,
          headers,
          body,
        });

        // Set response headers
        for (const [key, value] of Object.entries(response.headers)) {
          // Skip content-length as we may modify the body
          if (key.toLowerCase() === 'content-length' && devtoolsEnabled) continue;
          // Skip content-encoding to avoid issues with modified content
          if (key.toLowerCase() === 'content-encoding' && devtoolsEnabled) continue;
          res.setHeader(key, value);
        }

        // Handle CORS for iframe embedding
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');

        // Check if we should inject devtools script
        const contentType =
          response.headers['content-type'] || response.headers['Content-Type'] || '';
        const isHtml = contentType.toLowerCase().includes('text/html');

        if (devtoolsEnabled && isHtml && viewId && response.body) {
          // Inject devtools script into HTML
          const html = response.body.toString('utf-8');
          const scriptTag = getInspectorScriptTag(viewId, inspectorEnabled);

          // Inject before </head> or at the end of <body>
          let injectedHtml: string;
          if (html.includes('</head>')) {
            injectedHtml = html.replace('</head>', `${scriptTag}</head>`);
          } else if (html.includes('</body>')) {
            injectedHtml = html.replace('</body>', `${scriptTag}</body>`);
          } else if (html.includes('<body')) {
            // Inject after opening <body> tag
            injectedHtml = html.replace(/(<body[^>]*>)/i, `$1${scriptTag}`);
          } else {
            // Fallback: append at the end
            injectedHtml = html + scriptTag;
          }

          res.status(response.status).send(injectedHtml);
        } else {
          // Send response as-is
          res.status(response.status).send(response.body);
        }
      } catch (error) {
        console.error('[ProxyRoutes] Proxy request failed:', error);
        res.status(502).json({
          success: false,
          error: error instanceof Error ? error.message : 'Proxy request failed',
        });
      }
    }
  );

  // Handle requests to just /api/proxy/:port (without trailing path)
  router.all('/:port', deps.authMiddleware, (req: AuthenticatedRequest, res: Response) => {
    // Redirect to /api/proxy/:port/ for proper path handling
    const port = String(req.params.port);
    res.redirect(301, `/api/proxy/${port}/`);
  });

  return router;
}
