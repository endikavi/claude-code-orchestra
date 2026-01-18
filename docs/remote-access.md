# Remote Access Configuration

This guide explains how to configure remote access to Claude Code Orchestra, including reverse proxy setup with nginx and HTTPS configuration.

## Basic Configuration

Remote access allows you to control Claude Code Orchestra from any device on your network or the internet through a web browser.

### Enabling Remote Access

1. Open **Settings** > **Remote Access**
2. Set a secure password
3. Configure the port (default: 3847)
4. Click **Start Server**

### CORS Configuration

By default, the server only accepts connections from:
- `localhost`
- `127.0.0.1`
- The machine's local IP address

#### Allow Any Origin (LAN Access)

Enable "Allow connections from any origin" to allow connections from any device on your network. This is useful for:
- Accessing from mobile devices
- Accessing from other computers on your LAN

#### Custom Hostname

If you're accessing Orchestra through a custom domain or hostname (e.g., behind a reverse proxy), configure the **Custom hostname** field with your domain:

- `orchestra.local` - For local network access
- `orchestra.example.com` - For internet access

The server will automatically add your custom hostname to the allowed CORS origins.

## Reverse Proxy with nginx

Using nginx as a reverse proxy provides several benefits:
- HTTPS/SSL termination
- Custom domain names
- Load balancing (for cluster setups)
- Additional security headers

### Basic nginx Configuration

```nginx
server {
    listen 80;
    server_name orchestra.example.com;

    location / {
        proxy_pass http://localhost:3847;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout settings for long-running connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### HTTPS with Let's Encrypt

For production deployments, always use HTTPS. Here's how to set up SSL with Let's Encrypt:

1. Install Certbot:
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# macOS with Homebrew
brew install certbot
```

2. Obtain a certificate:
```bash
sudo certbot --nginx -d orchestra.example.com
```

3. nginx configuration with SSL:

```nginx
server {
    listen 80;
    server_name orchestra.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name orchestra.example.com;

    # SSL configuration (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/orchestra.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orchestra.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:3847;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeout settings
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

4. Set up automatic renewal:
```bash
sudo certbot renew --dry-run
```

### Local Network with mDNS

For local network access without a domain, you can use mDNS (Bonjour/Avahi):

1. Install Avahi (Linux):
```bash
sudo apt install avahi-daemon
```

2. Configure Orchestra with hostname: `orchestra.local`

3. Access via: `http://orchestra.local:3847`

## Security Considerations

### IP Access Control

Orchestra includes built-in IP access control. Configure it in **Settings** > **Security**:

- **Allowlist mode**: Only specified IPs can connect
- **Denylist mode**: Block specific IPs

Supported formats:
- Single IP: `192.168.1.100`
- CIDR notation: `192.168.1.0/24`
- Wildcard: `192.168.1.*`

### Rate Limiting

Built-in rate limiting protects against brute-force attacks:
- Configure max attempts and lockout duration
- View and unlock blocked IPs in Security settings

### Audit Logging

Enable audit logging to track:
- Login attempts (successful and failed)
- Session activity
- Configuration changes

### Recommended Security Practices

1. **Always use HTTPS** for production deployments
2. **Use strong passwords** - the password protects all remote access
3. **Configure IP allowlists** when possible
4. **Enable audit logging** for security monitoring
5. **Keep the application updated** for security patches

## Troubleshooting

### CORS Errors

If you see CORS errors in the browser console:

1. Ensure your hostname is configured in **Custom hostname** field
2. Or enable "Allow connections from any origin" for development/LAN use
3. Check that nginx is forwarding the correct headers

### WebSocket Connection Failed

1. Verify nginx has WebSocket headers configured:
   ```nginx
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

2. Check timeout settings - WebSocket connections need long timeouts

### Connection Timeout

1. Increase nginx timeout values
2. Check firewall rules for the configured port
3. Verify the Orchestra server is running

## API Reference

The remote access server exposes a REST API and WebSocket interface:

### REST Endpoints

- `POST /api/auth/login` - Authenticate and get JWT token
- `POST /api/auth/logout` - End session
- `GET /api/projects` - List projects
- `GET /api/instances` - List active instances
- `POST /api/instances` - Create new instance
- `DELETE /api/instances/:id` - Kill instance

### WebSocket Events

Connect to the root namespace with a valid JWT token:

**Server to Client:**
- `sync:state` - Full state synchronization
- `instance:output` - Instance output data
- `instance:status` - Status changes
- `instance:error` - Error messages
- `instance:exit` - Instance terminated

**Client to Server:**
- `instance:input` - Send input to instance
- `instance:resize` - Resize terminal
- `subscribe:instance` - Subscribe to instance updates
