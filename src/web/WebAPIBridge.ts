/**
 * WebAPIBridge - Replaces Electron IPC with REST API + WebSocket
 * This provides the same interface as electronAPI but uses fetch and Socket.IO
 */

import { io, Socket } from 'socket.io-client';
import type {
  Project,
  ClaudeInstance,
  ClaudeModel,
  InstanceMode,
  ClaudeSettings,
  McpServer,
  InstanceStatus,
  StreamMessage,
  Conversation,
  ConversationMessage,
  ConversationStatus,
  ClaudeSessionInfo,
  SessionImportBatchResult,
} from '@shared/types';
import type { SyncState } from '@shared/types/remote';

// Storage keys
const TOKEN_KEY = 'claude_dashboard_token';

// Get the base URL (same origin in production)
const getBaseUrl = () => {
  // In development, you might need to configure this
  return window.location.origin;
};

// Socket.IO connection
let socket: Socket | null = null;

// Event callbacks storage
type EventCallback<T extends unknown[]> = (...args: T) => void;
const eventCallbacks = new Map<string, Set<EventCallback<unknown[]>>>();

// Instance to conversation mapping (for web clients)
const instanceConversations = new Map<string, string>();

/**
 * Get the conversation ID for an instance
 */
export function getInstanceConversationId(instanceId: string): string | undefined {
  return instanceConversations.get(instanceId);
}

// Token management
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

interface ApiErrorResponse {
  error?: string;
}

// API fetch wrapper with authentication
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${getBaseUrl()}${endpoint}`, {
    ...options,
    headers,
  });

  const data = (await response.json()) as T & ApiErrorResponse;

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      disconnectSocket();
      // Redirect to login or trigger auth flow
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// Socket.IO connection management
export function connectSocket(): void {
  if (socket?.connected) return;

  const token = getToken();
  if (!token) return;

  socket = io(getBaseUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    // WebSocket connection established - useful for debugging connectivity issues
    // eslint-disable-next-line no-console
    console.log('[WebSocket] Connected');
  });

  socket.on('disconnect', () => {
    // WebSocket disconnection - useful for debugging connectivity issues
    // eslint-disable-next-line no-console
    console.log('[WebSocket] Disconnected');
  });

  socket.on('connect_error', (error: Error) => {
    console.error('[WebSocket] Connection error:', error);
    if (error.message.includes('Authentication')) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
  });

  // Sync state handler
  socket.on('sync:state', (state: SyncState) => {
    // Auto-subscribe to all existing instances
    if (state.instances && Array.isArray(state.instances)) {
      state.instances.forEach((instance) => {
        const inst = instance as { id?: string };
        if (inst.id) {
          subscribeToInstance(inst.id);
        }
      });
    }
    window.dispatchEvent(new CustomEvent('sync:state', { detail: state }));
  });

  // Instance event handlers
  socket.on('instance:output', (instanceId: string, data: StreamMessage) => {
    triggerEvent('instance:output', instanceId, data);
  });

  socket.on('instance:status', (instanceId: string, status: InstanceStatus) => {
    triggerEvent('instance:status', instanceId, status);
  });

  socket.on('instance:error', (instanceId: string, error: string) => {
    triggerEvent('instance:error', instanceId, error);
  });

  socket.on('instance:exit', (instanceId: string, code: number) => {
    triggerEvent('instance:exit', instanceId, code);
  });

  socket.on('instance:rawOutput', (instanceId: string, data: string) => {
    triggerEvent('instance:rawOutput', instanceId, data);
  });

  socket.on('instance:sessionId', (instanceId: string, sessionId: string) => {
    triggerEvent('instance:sessionId', instanceId, sessionId);
  });

  socket.on('session:kicked', (reason: string) => {
    // Session terminated by server - important to log for user awareness
    // eslint-disable-next-line no-console
    console.log('[WebSocket] Session kicked:', reason);
    clearToken();
    disconnectSocket();
    window.dispatchEvent(new CustomEvent('auth:kicked', { detail: reason }));
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Event system for instance events
function triggerEvent(event: string, ...args: unknown[]): void {
  const callbacks = eventCallbacks.get(event);
  if (callbacks) {
    callbacks.forEach((cb) => cb(...args));
  }
}

function addEventListener<T extends unknown[]>(
  event: string,
  callback: EventCallback<T>
): () => void {
  if (!eventCallbacks.has(event)) {
    eventCallbacks.set(event, new Set());
  }
  const callbacks = eventCallbacks.get(event) as Set<EventCallback<unknown[]>>;
  callbacks.add(callback as EventCallback<unknown[]>);

  return () => {
    callbacks.delete(callback as EventCallback<unknown[]>);
  };
}

// Subscribe to instance updates
export function subscribeToInstance(instanceId: string): void {
  socket?.emit('subscribe:instance', instanceId);
}

export function unsubscribeFromInstance(instanceId: string): void {
  socket?.emit('unsubscribe:instance', instanceId);
}

interface LoginApiResponse {
  success: boolean;
  token?: string;
}

// Login function
export async function login(password: string): Promise<boolean> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = (await response.json()) as LoginApiResponse;

    if (data.success && data.token) {
      setToken(data.token);
      connectSocket();
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// Logout function
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors during logout
  }
  clearToken();
  disconnectSocket();
}

// Create the web API bridge that mimics electronAPI
export const webAPI = {
  // Project operations
  project: {
    create: async (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> => {
      const response = await apiFetch<{ success: boolean; data: Project }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.data;
    },

    update: async (project: Project): Promise<Project> => {
      const response = await apiFetch<{ success: boolean; data: Project }>(
        `/api/projects/${project.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(project),
        }
      );
      return response.data;
    },

    delete: async (id: string): Promise<void> => {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    },

    getAll: async (): Promise<Project[]> => {
      const response = await apiFetch<{ success: boolean; data: Project[] }>('/api/projects');
      return response.data;
    },

    getById: async (id: string): Promise<Project | null> => {
      try {
        const response = await apiFetch<{ success: boolean; data: Project }>(`/api/projects/${id}`);
        return response.data;
      } catch {
        return null;
      }
    },
  },

  // Instance operations
  instance: {
    create: async (config: {
      projectId: string;
      prompt?: string;
      model: ClaudeModel;
      mode: InstanceMode;
      planMode?: boolean;
    }): Promise<ClaudeInstance & { conversationId?: string }> => {
      const response = await apiFetch<{
        success: boolean;
        data: ClaudeInstance;
        conversationId?: string;
      }>('/api/instances', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      // Auto-subscribe to the new instance
      subscribeToInstance(response.data.id);
      // Store the conversation mapping
      if (response.conversationId) {
        instanceConversations.set(response.data.id, response.conversationId);
      }
      return { ...response.data, conversationId: response.conversationId };
    },

    kill: async (id: string): Promise<void> => {
      await apiFetch(`/api/instances/${id}`, { method: 'DELETE' });
      unsubscribeFromInstance(id);
      instanceConversations.delete(id);
    },

    sendInput: (id: string, input: string): void => {
      // Use WebSocket for real-time input
      socket?.emit('instance:input', id, input);
    },

    getAll: async (): Promise<ClaudeInstance[]> => {
      const response = await apiFetch<{
        success: boolean;
        data: ClaudeInstance[];
        outputs?: Record<string, { messages: StreamMessage[]; rawOutput: string }>;
      }>('/api/instances?includeOutputs=true');

      // If outputs are included, dispatch sync event to update stores
      if (response.outputs) {
        window.dispatchEvent(
          new CustomEvent('sync:state', {
            detail: { instances: response.data, outputs: response.outputs },
          })
        );
      }

      return response.data;
    },

    getByProject: async (projectId: string): Promise<ClaudeInstance[]> => {
      const response = await apiFetch<{
        success: boolean;
        data: ClaudeInstance[];
      }>(`/api/instances?projectId=${projectId}`);
      return response.data;
    },

    resize: (id: string, cols: number, rows: number): void => {
      socket?.emit('instance:resize', id, cols, rows);
    },

    resume: async (config: {
      projectId: string;
      sessionId: string;
      model: ClaudeModel;
      mode: InstanceMode;
    }): Promise<ClaudeInstance> => {
      const response = await apiFetch<{
        success: boolean;
        data: ClaudeInstance;
      }>('/api/instances/resume', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      subscribeToInstance(response.data.id);
      return response.data;
    },

    // Event listeners
    onOutput: (callback: (instanceId: string, data: StreamMessage) => void): (() => void) => {
      return addEventListener('instance:output', callback);
    },

    onStatus: (callback: (instanceId: string, status: InstanceStatus) => void): (() => void) => {
      return addEventListener('instance:status', callback);
    },

    onError: (callback: (instanceId: string, error: string) => void): (() => void) => {
      return addEventListener('instance:error', callback);
    },

    onExit: (callback: (instanceId: string, code: number) => void): (() => void) => {
      return addEventListener('instance:exit', callback);
    },

    onRawOutput: (callback: (instanceId: string, data: string) => void): (() => void) => {
      return addEventListener('instance:rawOutput', callback);
    },

    onSessionId: (callback: (instanceId: string, sessionId: string) => void): (() => void) => {
      return addEventListener('instance:sessionId', callback);
    },
  },

  // Conversation operations
  conversation: {
    create: async (data: {
      projectId: string;
      title: string;
      initialPrompt: string;
      model: ClaudeModel;
      mode: InstanceMode;
    }): Promise<Conversation> => {
      const response = await apiFetch<{ success: boolean; data: Conversation }>(
        '/api/conversations',
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
      return response.data;
    },

    update: async (
      id: string,
      updates: Partial<{
        sessionId: string;
        status: ConversationStatus;
        totalCostUsd: number;
        messageCount: number;
        title: string;
      }>
    ): Promise<Conversation | null> => {
      try {
        const response = await apiFetch<{
          success: boolean;
          data: Conversation;
        }>(`/api/conversations/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        return response.data;
      } catch {
        return null;
      }
    },

    delete: async (id: string): Promise<void> => {
      await apiFetch(`/api/conversations/${id}`, { method: 'DELETE' });
    },

    getByProject: async (projectId: string): Promise<Conversation[]> => {
      const response = await apiFetch<{
        success: boolean;
        data: Conversation[];
      }>(`/api/conversations?projectId=${projectId}`);
      return response.data;
    },

    getById: async (id: string): Promise<Conversation | null> => {
      try {
        const response = await apiFetch<{
          success: boolean;
          data: Conversation;
        }>(`/api/conversations/${id}`);
        return response.data;
      } catch {
        return null;
      }
    },

    addMessage: async (data: {
      conversationId: string;
      type: string;
      content: string;
      costUsd?: number;
    }): Promise<ConversationMessage> => {
      const response = await apiFetch<{
        success: boolean;
        data: ConversationMessage;
      }>(`/api/conversations/${data.conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.data;
    },

    getMessages: async (conversationId: string): Promise<ConversationMessage[]> => {
      const response = await apiFetch<{
        success: boolean;
        data: ConversationMessage[];
      }>(`/api/conversations/${conversationId}/messages`);
      return response.data;
    },
  },

  // Config operations (limited in web version)
  config: {
    getClaudeSettings: (): Promise<ClaudeSettings | null> => {
      // Not available in web version
      return Promise.resolve(null);
    },

    getMcpServers: (): Promise<McpServer[]> => {
      // Not available in web version
      return Promise.resolve([]);
    },
  },

  // Window operations (no-op in web version)
  window: {
    minimize: (): void => {
      // No-op: window operations not available in web version
    },
    maximize: (): void => {
      // No-op: window operations not available in web version
    },
    close: (): void => {
      // No-op: window operations not available in web version
    },
  },

  // Dialog operations (web alternatives)
  dialog: {
    selectDirectory: (): Promise<string | null> => {
      // Web version can't select directories
      // Could show a modal asking for path input instead
      return Promise.resolve(null);
    },
  },

  // Session import operations (not available in web version)
  session: {
    getAvailable: (): Promise<ClaudeSessionInfo[]> => Promise.resolve([]),
    getCount: (): Promise<number> => Promise.resolve(0),
    import: (): Promise<{ success: false; error: string }> =>
      Promise.resolve({
        success: false,
        error: 'Not available in web version',
      }),
    importBatch: (): Promise<SessionImportBatchResult> =>
      Promise.resolve({
        imported: 0,
        failed: 0,
        errors: [],
      }),
    checkInstalled: (): Promise<boolean> => Promise.resolve(false),
  },

  // Remote operations (not needed in web version - we ARE the remote client)
  remote: {
    getConfig: () =>
      Promise.resolve({
        enabled: true,
        port: 0,
        passwordHash: '',
        autoStart: false,
      }),
    updateConfig: () =>
      Promise.resolve({
        enabled: true,
        port: 0,
        passwordHash: '',
        autoStart: false,
      }),
    setPassword: () =>
      Promise.resolve({
        enabled: true,
        port: 0,
        passwordHash: '',
        autoStart: false,
      }),
    startServer: () =>
      Promise.resolve({ success: false as const, error: 'Not available in web version' }),
    stopServer: () => Promise.resolve({ success: false as const }),
    getStatus: () =>
      Promise.resolve({
        running: false,
        port: 0,
        url: null,
        localIp: null,
        activeSessions: 0,
        sessions: [],
      }),
    kickSession: () => Promise.resolve({ success: false as const }),
    getQrCode: () =>
      Promise.resolve({ success: false as const, error: 'Not available in web version' }),
  },
};

// Initialize on module load
if (isAuthenticated()) {
  connectSocket();
}
