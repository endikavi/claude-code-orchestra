# SSL/TLS Configuration Guide

This document describes how to configure HTTPS/WSS encryption for Claude Code Orchestra's remote access and cluster communication.

## Overview

Claude Code Orchestra supports SSL/TLS encryption for:

- **Remote Access (WebServer)**: Secure web client connections
- **Cluster Communication**: Encrypted node-to-node communication

When SSL is enabled:
- HTTP becomes HTTPS
- WebSocket (WS) automatically becomes WSS (WebSocket Secure)
- All traffic between clients and server is encrypted

## Configuration Options

### Self-Signed Certificates (Recommended for Development/LAN)

The simplest option is to use auto-generated self-signed certificates:

1. Enable SSL in Settings
2. Select "Self-Signed" certificate type
3. Start the server

The application will automatically generate a certificate valid for 365 days, stored in your app data directory (`~/.claude-orchestra/ssl/`).

**Note**: Browsers will show a security warning for self-signed certificates. This is expected - the traffic is still encrypted.

### Custom Certificates (Recommended for Production)

For production environments, use certificates from a recognized Certificate Authority:

1. Enable SSL in Settings
2. Select "Custom Certificate" type
3. Provide paths to:
   - Certificate file (`.crt` or `.pem`)
   - Private key file (`.key`)
   - (Optional) CA certificate bundle

#### Getting Certificates

**Let's Encrypt (Free)**:
```bash
# Using certbot
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be at:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

**Self-signed with OpenSSL**:
```bash
# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 \
  -keyout server.key -out server.crt \
  -days 365 -nodes \
  -subj "/CN=localhost"
```

## Remote Access Configuration

### UI Configuration

1. Go to Settings > Remote Access
2. Scroll to "SSL/TLS Encryption"
3. Enable the SSL toggle
4. Choose certificate type:
   - **Self-Signed**: Auto-generates certificate
   - **Custom**: Provide your own certificate paths
5. Restart the server

### API Response

When SSL is enabled, the server status URL will show `https://` instead of `http://`:

```json
{
  "running": true,
  "port": 3847,
  "url": "https://192.168.1.100:3847"
}
```

## Cluster Configuration

### Primary Node

1. Go to Settings > Cluster
2. Set role to "Primary"
3. In Primary Node Settings, enable SSL/TLS
4. Choose certificate type
5. Start the cluster

The cluster server will listen on HTTPS and accept WSS connections from secondary nodes.

### Secondary Node

1. Go to Settings > Cluster
2. Set role to "Secondary"
3. Enable SSL/TLS
4. If connecting to a primary with self-signed certificate, enable "Allow self-signed certificates"
5. Enter primary node address and connect

## Reverse Proxy Alternative

If you prefer not to configure SSL directly in the application, you can use a reverse proxy:

### Nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3847;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Configuration (Automatic HTTPS)

```caddyfile
your-domain.com {
    reverse_proxy localhost:3847
}
```

Caddy automatically obtains and renews Let's Encrypt certificates.

## Troubleshooting

### Certificate Validation Failed

- Ensure certificate files exist and are readable
- Check certificate format (PEM format required)
- Verify certificate hasn't expired
- For custom certificates, ensure cert and key match

### Connection Refused

- Check firewall allows the configured port
- Verify server is running (check logs)
- For self-signed certs, ensure client allows self-signed

### Browser Security Warning

- Normal for self-signed certificates
- Click "Advanced" > "Proceed" to continue
- For production, use certificates from a recognized CA

### Secondary Node Can't Connect

- Ensure SSL settings match on both nodes
- For self-signed primary, enable "Allow self-signed" on secondary
- Check network connectivity and firewall rules

## Security Best Practices

1. **Production**: Always use certificates from a recognized CA
2. **Key Protection**: Keep private keys secure (600 permissions)
3. **Certificate Renewal**: Monitor expiration dates
4. **Strong Ciphers**: The application uses modern TLS settings
5. **Network Segmentation**: Consider placing cluster communication on a private network

## Technical Details

### TLS Version

The application uses Node.js's TLS implementation, supporting TLS 1.2 and TLS 1.3.

### Certificate Storage

Self-signed certificates are stored at:
- **Windows**: `%APPDATA%/claude-orchestra/ssl/`
- **macOS**: `~/Library/Application Support/claude-orchestra/ssl/`
- **Linux**: `~/.config/claude-orchestra/ssl/`

### Socket.IO Transport

When SSL is enabled:
- Primary transport: WebSocket (WSS)
- Fallback: HTTPS long-polling

Both are encrypted under TLS.
