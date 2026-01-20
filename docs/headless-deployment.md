# Headless Server Deployment

This guide explains how to deploy Claude Code Orchestra as a headless server without the Electron UI, including cluster configuration and production deployment with nginx.

## Overview

Headless mode allows running Orchestra as a server-only application, perfect for:
- Linux VMs without a GUI
- Docker containers
- Cloud deployments
- Headless development servers
- Cluster primary nodes

## Quick Start

### Building the CLI

```bash
# Install dependencies
npm install

# Build the CLI and web interface
npm run build:cli
npm run build:web
```

### Basic Server Mode

```bash
# Start server with password protection
node dist/cli/main/cli/index.js --port 3847 --password "your-secure-password"
```

Access the web UI at `http://localhost:3847`

## CLI Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Web server port | 3847 |
| `--password <string>` | Access password (will be hashed) | - |
| `--cluster-role <role>` | Role: `standalone`, `primary`, `secondary` | standalone |
| `--primary-host <host>` | Primary node hostname/IP (for secondary) | - |
| `--primary-port <number>` | Primary node cluster port | 3848 |
| `--shared-secret <string>` | Cluster authentication secret | - |
| `--node-name <string>` | Display name for this node | hostname |
| `--data-dir <path>` | Data storage directory | ~/.claude-code-orchestra |
| `--config <path>` | Path to JSON configuration file | - |
| `--allow-any-cors` | Allow CORS from any origin | false |

## Configuration File

Instead of CLI arguments, you can use a JSON configuration file:

```json
{
  "server": {
    "port": 3847,
    "password": "your-secure-password",
    "allowAnyCors": false
  },
  "cluster": {
    "role": "primary",
    "nodeName": "Production-Server",
    "primaryPort": 3848,
    "sharedSecret": "cluster-shared-secret"
  },
  "paths": {
    "dataDir": "/var/lib/orchestra"
  }
}
```

Usage:
```bash
node dist/cli/main/cli/index.js --config /etc/orchestra/config.json
```

## Cluster Deployment

### Architecture

```
                    ┌─────────────────────┐
                    │     Internet        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   nginx (HTTPS)     │
                    │  orchestra.example.com
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
   ┌──────────▼──────────┐    │    ┌──────────▼──────────┐
   │   Primary Node      │◄───┼───►│   Secondary Node    │
   │   (Linux VM)        │    │    │   (Windows PC)      │
   │   :3847 (web)       │    │    │   :3848 (web)       │
   │   :3848 (cluster)   │    │    └─────────────────────┘
   └─────────────────────┘    │
                              │    ┌─────────────────────┐
                              └───►│   Secondary Node    │
                                   │   (macOS)           │
                                   │   :3849 (web)       │
                                   └─────────────────────┘
```

### Setting Up the Primary Node

On your main Linux server (e.g., `192.168.1.100`):

```bash
# Create data directory
sudo mkdir -p /var/lib/orchestra
sudo chown $USER:$USER /var/lib/orchestra

# Start as primary
node dist/cli/main/cli/index.js \
  --port 3847 \
  --password "web-access-password" \
  --cluster-role primary \
  --shared-secret "your-cluster-secret-key" \
  --node-name "Primary-Server" \
  --data-dir /var/lib/orchestra
```

### Setting Up Secondary Nodes

On each secondary machine:

```bash
node dist/cli/main/cli/index.js \
  --port 3848 \
  --password "local-web-password" \
  --cluster-role secondary \
  --primary-host 192.168.1.100 \
  --primary-port 3848 \
  --shared-secret "your-cluster-secret-key" \
  --node-name "Dev-Workstation"
```

**Important**: The `--shared-secret` must be identical on all nodes.

## Production Deployment with nginx

### Basic nginx Configuration

Create `/etc/nginx/sites-available/orchestra`:

```nginx
server {
    listen 80;
    server_name orchestra.example.com;

    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_http_version 1.1;

        # WebSocket support (required)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long timeout for WebSocket connections
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/orchestra /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### HTTPS with Let's Encrypt

1. Install Certbot:
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
```

2. Obtain certificate:
```bash
sudo certbot --nginx -d orchestra.example.com
```

3. The nginx configuration will be automatically updated to:

```nginx
server {
    listen 80;
    server_name orchestra.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name orchestra.example.com;

    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/orchestra.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/orchestra.example.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward client information
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Long timeout for WebSocket
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

## Running as a Systemd Service

Create `/etc/systemd/system/orchestra.service`:

```ini
[Unit]
Description=Claude Code Orchestra
After=network.target

[Service]
Type=simple
User=orchestra
Group=orchestra
WorkingDirectory=/opt/orchestra
ExecStart=/usr/bin/node /opt/orchestra/dist/cli/main/cli/index.js --config /etc/orchestra/config.json
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/orchestra

[Install]
WantedBy=multi-user.target
```

Setup:
```bash
# Create service user
sudo useradd -r -s /bin/false orchestra

# Create directories
sudo mkdir -p /opt/orchestra /etc/orchestra /var/lib/orchestra
sudo chown orchestra:orchestra /var/lib/orchestra

# Copy application
sudo cp -r dist /opt/orchestra/
sudo cp -r node_modules /opt/orchestra/

# Create config
sudo tee /etc/orchestra/config.json << 'EOF'
{
  "server": {
    "port": 3847,
    "password": "your-secure-password",
    "allowAnyCors": false
  },
  "cluster": {
    "role": "primary",
    "nodeName": "Production-Primary",
    "primaryPort": 3848,
    "sharedSecret": "your-cluster-secret"
  },
  "paths": {
    "dataDir": "/var/lib/orchestra"
  }
}
EOF

# Secure config file
sudo chmod 600 /etc/orchestra/config.json
sudo chown orchestra:orchestra /etc/orchestra/config.json

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable orchestra
sudo systemctl start orchestra

# Check status
sudo systemctl status orchestra
sudo journalctl -u orchestra -f
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-slim

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist

# Create data directory
RUN mkdir -p /data

EXPOSE 3847 3848

ENTRYPOINT ["node", "dist/cli/main/cli/index.js"]
CMD ["--port", "3847", "--data-dir", "/data"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  orchestra-primary:
    build: .
    ports:
      - "3847:3847"
      - "3848:3848"
    volumes:
      - orchestra-data:/data
    environment:
      - NODE_ENV=production
    command: >
      --port 3847
      --password ${ORCHESTRA_PASSWORD}
      --cluster-role primary
      --shared-secret ${CLUSTER_SECRET}
      --node-name Docker-Primary
      --data-dir /data
    restart: unless-stopped

volumes:
  orchestra-data:
```

Run with:
```bash
ORCHESTRA_PASSWORD=your-password CLUSTER_SECRET=your-secret docker-compose up -d
```

## Example: Team Development Server

### Scenario

- Primary server: Linux VM at `dev-server.company.local` (192.168.1.50)
- Public access via: `orchestra.company.com`
- Team members connect their local Orchestra instances as secondary nodes

### Primary Server Setup

```bash
# /etc/orchestra/config.json
{
  "server": {
    "port": 3847,
    "password": "team-web-password-2024",
    "allowAnyCors": false
  },
  "cluster": {
    "role": "primary",
    "nodeName": "Dev-Server-Primary",
    "primaryPort": 3848,
    "sharedSecret": "company-cluster-secret-xyz"
  },
  "paths": {
    "dataDir": "/var/lib/orchestra"
  }
}
```

### Developer Workstation Setup

Each developer runs:
```bash
# Windows/macOS/Linux workstation
node dist/cli/main/cli/index.js \
  --port 3850 \
  --cluster-role secondary \
  --primary-host dev-server.company.local \
  --shared-secret "company-cluster-secret-xyz" \
  --node-name "$(whoami)-workstation"
```

Or using the Electron app:
1. Go to **Settings** > **Cluster**
2. Set role to **Secondary**
3. Enter primary host: `dev-server.company.local`
4. Enter shared secret
5. Click **Connect**

### Accessing the Cluster

- **Via Web**: `https://orchestra.company.com` (nginx proxy)
- **Direct to Primary**: `http://dev-server.company.local:3847`
- **Local Workstation**: `http://localhost:3850`

All nodes share projects and can see instances running on any node.

## Monitoring and Health Checks

### Health Endpoint

The server exposes a health check at `/api/health`:

```bash
curl http://localhost:3847/api/health
```

Response:
```json
{
  "status": "healthy",
  "version": "0.1.0-beta.2",
  "uptime": 3600,
  "cluster": {
    "role": "primary",
    "connected": true,
    "nodeCount": 3
  }
}
```

### nginx Health Check

```nginx
location /health {
    proxy_pass http://127.0.0.1:3847/api/health;
    proxy_connect_timeout 5s;
    proxy_read_timeout 5s;
}
```

## Troubleshooting

### Server Won't Start

1. Check port availability:
   ```bash
   netstat -tlnp | grep 3847
   ```

2. Verify data directory permissions:
   ```bash
   ls -la /var/lib/orchestra
   ```

3. Check logs:
   ```bash
   journalctl -u orchestra -n 100
   ```

### Cluster Connection Failed

1. Verify network connectivity:
   ```bash
   ping primary-host
   nc -zv primary-host 3848
   ```

2. Check shared secret matches on all nodes

3. Verify firewall allows cluster port (default 3848)

### WebSocket Connection Issues

1. Ensure nginx has WebSocket headers configured
2. Check for proxy/firewall intercepting WebSocket upgrade
3. Verify `proxy_read_timeout` is long enough

## Security Best Practices

1. **Always use HTTPS** in production
2. **Use strong passwords** for web access
3. **Use unique shared secrets** per cluster
4. **Restrict network access** with firewall rules
5. **Run as non-root user** using systemd
6. **Keep the application updated**
7. **Enable audit logging** for security monitoring
8. **Use IP allowlists** when possible

## See Also

- [Remote Access Configuration](./remote-access.md)
- [Security Model](./security-model.md)
- [Architecture Overview](./architecture.md)
