# Web Access Guide

This document explains how to set up and use remote web access for Claude Code Orchestra.

## Overview

Claude Code Orchestra provides a web interface for remote access, allowing you to manage Claude instances from any browser on your network.

```
┌─────────────────┐         ┌─────────────────┐
│  Browser/Phone  │────────▶│   Web Server    │
│   (Web Client)  │◀────────│ (Port 3847)     │
└─────────────────┘   HTTP  │                 │
                    WebSocket│ ┌─────────────┐│
                            │ │ Socket.IO   ││
                            │ └─────────────┘│
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  Main Process   │
                            │  (Dashboard)    │
                            └─────────────────┘
```

## Enabling Remote Access

### Desktop App Configuration

1. Open Claude Code Orchestra desktop app
2. Navigate to **Settings > Remote Access**
3. Enable "Allow Remote Access"
4. Set a secure password
5. Note the URL shown (e.g., `http://192.168.1.100:3847`)

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| Enable Remote Access | Master toggle | Off |
| Port | HTTP/WebSocket port | 3847 |
| Password | Login password | (required) |
| Custom Hostname | Alternative hostname | (empty) |
| Allow Any CORS | Allow all origins | Off |

## Connecting from Web Client

### Browser Access

1. Open the URL shown in settings
2. Enter the configured password
3. You're now connected to the dashboard

### Mobile Access

The web interface is responsive and works on mobile devices:
- Same URL as browser
- Touch-friendly controls
- Terminal emulation works on mobile

## Authentication

### Login Flow

```
┌────────┐                    ┌────────────┐
│ Client │                    │   Server   │
└───┬────┘                    └─────┬──────┘
    │ POST /api/auth/login          │
    │ {password: "..."}             │
    │─────────────────────────────▶│
    │                               │
    │        {token: "jwt..."}      │
    │◀─────────────────────────────│
    │                               │
    │ Subsequent requests include   │
    │ Authorization: Bearer <token> │
    │─────────────────────────────▶│
```

### Session Management

- Tokens expire based on configured timeout (default: 24 hours)
- Maximum concurrent sessions can be limited
- Admin can kick active sessions from desktop app

## WebSocket Communication

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://192.168.1.100:3847', {
  auth: { token: 'your-jwt-token' }
});
```

### Events

**Server → Client:**
- `sync:state` - Full state update
- `instance:output` - Instance output message
- `instance:status` - Status change
- `instance:rawOutput` - Raw terminal data
- `instance:exit` - Process exit
- `session:kicked` - Forced logout

**Client → Server:**
- `instance:input` - Send input to instance
- `instance:resize` - Resize terminal
- `subscribe:instance` - Subscribe to instance updates
- `unsubscribe:instance` - Unsubscribe from updates

## REST API

### Endpoints

**Authentication:**
```
POST /api/auth/login    - Login
POST /api/auth/logout   - Logout
GET  /api/auth/me       - Get current session
```

**Projects:**
```
GET    /api/projects      - List projects
GET    /api/projects/:id  - Get project
POST   /api/projects      - Create project
PUT    /api/projects/:id  - Update project
DELETE /api/projects/:id  - Delete project
```

**Instances:**
```
GET    /api/instances           - List instances
GET    /api/instances/:id       - Get instance
POST   /api/instances           - Create instance
DELETE /api/instances/:id       - Kill instance
POST   /api/instances/:id/input - Send input
POST   /api/instances/resume    - Resume session
```

**Conversations:**
```
GET    /api/conversations           - List conversations
GET    /api/conversations/:id       - Get conversation
POST   /api/conversations           - Create conversation
PUT    /api/conversations/:id       - Update conversation
DELETE /api/conversations/:id       - Delete conversation
```

**Sync:**
```
GET /api/sync  - Get full state snapshot
```

## State Synchronization

### Initial Sync

On connection, client receives full state:

```typescript
interface SyncState {
  projects: Project[];
  instances: ClaudeInstance[];
  conversations: Conversation[];
  outputs: Record<string, InstanceOutputBuffer>;
  instanceConversations: Record<string, string>;
}
```

### Real-time Updates

After initial sync, real-time events keep state current:

```javascript
socket.on('sync:state', (state) => {
  // Full state refresh
  updateAllStores(state);
});

socket.on('instance:output', (instanceId, message) => {
  // Incremental update
  addMessageToInstance(instanceId, message);
});
```

## WebAPIBridge

For web clients, the `WebAPIBridge` provides an interface compatible with the Electron API:

```typescript
// src/web/services/WebAPIBridge.ts

class WebAPIBridge {
  private socket: Socket;
  private token: string;

  // Project operations
  async getProjects(): Promise<Project[]> {
    const response = await this.api.get('/projects');
    return response.data;
  }

  // Instance operations
  async createInstance(config: InstanceConfig): Promise<ClaudeInstance> {
    const response = await this.api.post('/instances', config);
    return response.data;
  }

  // Real-time subscriptions
  onInstanceOutput(callback: OutputCallback): () => void {
    this.socket.on('instance:output', callback);
    return () => this.socket.off('instance:output', callback);
  }
}
```

## Security Considerations

### Network Security

- Use on trusted networks only
- Consider reverse proxy with HTTPS for internet access
- Enable IP allowlist for known clients

### Password Security

- Use strong, unique passwords
- Passwords are hashed with bcrypt
- Consider changing password periodically

### Session Security

- Sessions can be kicked by admin
- Configure session timeout appropriately
- Monitor audit logs for suspicious activity

## Troubleshooting

### Cannot Connect

1. Verify remote access is enabled in settings
2. Check firewall allows port 3847
3. Ensure you're on the same network
4. Try the IP address instead of hostname

### Authentication Fails

1. Verify password is correct
2. Check for IP blocking (rate limit)
3. Review audit logs for failure reason
4. Try clearing browser cookies

### Connection Drops

1. Check network stability
2. Verify WebSocket port is open
3. Look for proxy/firewall interference
4. Try reconnecting

### Slow Performance

1. Check network latency
2. Reduce output buffer size
3. Close unused instances
4. Consider structured view for less data

## Example Usage

### Quick Start (JavaScript)

```javascript
// Connect and authenticate
const response = await fetch('http://192.168.1.100:3847/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'your-password' })
});
const { token } = await response.json();

// Create instance
const instance = await fetch('http://192.168.1.100:3847/api/instances', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    projectId: 'proj-123',
    model: 'claude-sonnet-4-20250514',
    mode: 'stream-json'
  })
});

// Connect WebSocket for real-time updates
const socket = io('http://192.168.1.100:3847', {
  auth: { token }
});

socket.on('instance:output', (instanceId, message) => {
  console.log('Output:', message);
});
```
