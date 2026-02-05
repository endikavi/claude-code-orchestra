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
  ProxyConfig,
  AllowedPort,
} from '@shared/types';
import type { SyncState } from '@shared/types/remote';
import type { SubagentInstance } from '@shared/types/orchestration';
import type { TrackedTeam } from '@shared/types/teams';
import type { TrackedPlan } from '@shared/types/plans';

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

  // If there's a disconnected socket, clean it up completely to prevent duplicate listeners
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    eventCallbacks.clear();
  }

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

  // Handle reconnection - request fresh state from server
  socket.io.on('reconnect', (attempt: number) => {
    // eslint-disable-next-line no-console
    console.log(`[WebSocket] Reconnected after ${attempt} attempts`);
    // The server will send sync:state on reconnect, but we can also request it explicitly
    socket?.emit('request:sync');
  });

  socket.on('connect_error', (error: Error) => {
    console.error('[WebSocket] Connection error:', error);
    if (error.message.includes('Authentication')) {
      clearToken();
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
  });

  // Sync state handler
  socket.on('sync:state', async (state: SyncState) => {
    // eslint-disable-next-line no-console
    console.log(
      `[WebSocket] Received sync:state with ${state.instances?.length || 0} instances`,
      state.instances?.map((i) => ({ id: i.id, status: i.status }))
    );
    // Auto-subscribe to all existing instances in parallel
    if (state.instances && Array.isArray(state.instances)) {
      const subscriptions = state.instances.map((instance) => {
        const inst = instance as { id?: string };
        if (inst.id) {
          return subscribeToInstance(inst.id);
        }
        return Promise.resolve(false);
      });
      await Promise.all(subscriptions);
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

  socket.on('instance:terminalTitle', (instanceId: string, title: string) => {
    triggerEvent('instance:terminalTitle', instanceId, title);
  });

  // Terminal dimension sync (for multi-client synchronization)
  socket.on('instance:dimensionSync', (instanceId: string, cols: number, rows: number) => {
    triggerEvent('instance:dimensionSync', instanceId, cols, rows);
  });

  // Subagent events
  socket.on('subagent:started', (data: { instanceId: string; subagent: SubagentInstance }) => {
    triggerEvent('subagent:started', data.instanceId, data.subagent);
  });

  socket.on('subagent:completed', (data: { instanceId: string; subagent: SubagentInstance }) => {
    triggerEvent('subagent:completed', data.instanceId, data.subagent);
  });

  // Team events
  socket.on('team:created', (data: { team: TrackedTeam }) => {
    triggerEvent('team:created', data.team);
  });

  socket.on('team:updated', (data: { team: TrackedTeam }) => {
    triggerEvent('team:updated', data.team);
  });

  socket.on('team:deleted', (data: { teamName: string }) => {
    triggerEvent('team:deleted', data.teamName);
  });

  // Plan events
  socket.on('plan:created', (data: { plan: TrackedPlan }) => {
    triggerEvent('plan:created', data.plan);
  });

  socket.on('plan:updated', (data: { plan: TrackedPlan }) => {
    triggerEvent('plan:updated', data.plan);
  });

  socket.on('plan:deleted', (data: { planName: string }) => {
    triggerEvent('plan:deleted', data.planName);
  });

  socket.on('session:kicked', (reason: string) => {
    // Session terminated by server - important to log for user awareness
    // eslint-disable-next-line no-console
    console.log('[WebSocket] Session kicked:', reason);
    clearToken();
    disconnectSocket();
    window.dispatchEvent(new CustomEvent('auth:kicked', { detail: reason }));
  });

  // Proxy events
  socket.on(
    'proxy:open',
    (data: {
      port: number;
      path?: string;
      split?: boolean;
      title?: string;
      instanceId?: string;
    }) => {
      window.dispatchEvent(new CustomEvent('proxy:open', { detail: data }));
    }
  );
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  eventCallbacks.clear();
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

// Subscribe to instance updates with retry logic
export function subscribeToInstance(instanceId: string, retries = 3): Promise<boolean> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve(false);
      return;
    }

    let resolved = false;

    const attemptSubscribe = (attemptsLeft: number, cleanup: () => void) => {
      if (resolved || !socket?.connected) {
        if (!resolved) resolve(false);
        return;
      }

      socket.emit('subscribe:instance', instanceId, (response: { success: boolean }) => {
        if (resolved) return;

        if (response?.success) {
          resolved = true;
          cleanup();
          resolve(true);
        } else if (attemptsLeft > 1) {
          // Retry after a short delay
          setTimeout(() => attemptSubscribe(attemptsLeft - 1, cleanup), 500);
        } else {
          resolved = true;
          cleanup();
          resolve(false);
        }
      });
    };

    // Timeout fallback after 5 seconds total
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, 5000);

    // Start subscription attempt with cleanup function
    attemptSubscribe(retries, () => clearTimeout(timeoutId));
  });
}

export function unsubscribeFromInstance(instanceId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve(false);
      return;
    }
    socket.emit('unsubscribe:instance', instanceId, (response: { success: boolean }) => {
      resolve(response?.success ?? false);
    });
    // Timeout fallback in case callback is not called
    setTimeout(() => resolve(true), 1000);
  });
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
      // Auto-subscribe to the new instance and wait for confirmation
      await subscribeToInstance(response.data.id);
      // Store the conversation mapping
      if (response.conversationId) {
        instanceConversations.set(response.data.id, response.conversationId);
      }
      return { ...response.data, conversationId: response.conversationId };
    },

    kill: async (id: string): Promise<void> => {
      await apiFetch(`/api/instances/${id}`, { method: 'DELETE' });
      void unsubscribeFromInstance(id);
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
        instanceConversations?: Record<string, string>;
      }>('/api/instances?includeOutputs=true');

      // If outputs are included, dispatch sync event to update stores
      if (response.outputs) {
        window.dispatchEvent(
          new CustomEvent('sync:state', {
            detail: {
              instances: response.data,
              outputs: response.outputs,
              instanceConversations: response.instanceConversations,
            },
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
      prompt?: string;
    }): Promise<ClaudeInstance> => {
      const response = await apiFetch<{
        success: boolean;
        data: ClaudeInstance;
      }>('/api/instances/resume', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      await subscribeToInstance(response.data.id);
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

    onTerminalTitle: (callback: (instanceId: string, title: string) => void): (() => void) => {
      return addEventListener('instance:terminalTitle', callback);
    },

    onDimensionSync: (
      callback: (instanceId: string, cols: number, rows: number) => void
    ): (() => void) => {
      return addEventListener('instance:dimensionSync', callback);
    },

    // Web clients receive sync via socket 'sync:state' event, this is a no-op for compatibility
    onSync: (_callback: (instances: ClaudeInstance[]) => void): (() => void) => {
      // No-op: web clients sync via socket events, not IPC
      return () => {};
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

  // Shell operations (not available in web version)
  shell: {
    openTerminal: (): Promise<{ success: boolean; error?: string }> =>
      Promise.resolve({ success: false, error: 'Not available in web version' }),
    create: (): Promise<never> => Promise.reject(new Error('Not available in web version')),
    kill: (): Promise<void> => Promise.resolve(),
    sendInput: (): Promise<void> => Promise.resolve(),
    resize: (): void => {
      // No-op: shell resize not available in web version
    },
    onRawOutput: (): (() => void) => () => {
      // No-op cleanup
    },
    onStatus: (): (() => void) => () => {
      // No-op cleanup
    },
    onExit: (): (() => void) => () => {
      // No-op cleanup
    },
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

  // Subagent operations (native Claude Task tool tracking)
  subagent: {
    getByInstance: async (instanceId: string): Promise<SubagentInstance[]> => {
      const response = await apiFetch<{
        success: boolean;
        data: SubagentInstance[];
      }>(`/api/instances/${instanceId}/subagents`);
      return response.data;
    },

    getAll: async (): Promise<SubagentInstance[]> => {
      const response = await apiFetch<{
        success: boolean;
        data: SubagentInstance[];
      }>('/api/subagents');
      return response.data;
    },

    onStarted: (
      callback: (instanceId: string, subagent: SubagentInstance) => void
    ): (() => void) => {
      return addEventListener('subagent:started', callback);
    },

    onCompleted: (
      callback: (instanceId: string, subagent: SubagentInstance) => void
    ): (() => void) => {
      return addEventListener('subagent:completed', callback);
    },
  },

  // Team operations
  team: {
    getAll: async (): Promise<TrackedTeam[]> => {
      const response = await apiFetch<{ success: boolean; data: TrackedTeam[] }>('/api/teams');
      return response.data;
    },

    getByName: async (teamName: string): Promise<TrackedTeam | null> => {
      const teams = await apiFetch<{ success: boolean; data: TrackedTeam[] }>('/api/teams');
      return teams.data.find((t) => t.name === teamName) || null;
    },

    onCreated: (callback: (team: TrackedTeam) => void): (() => void) => {
      return addEventListener('team:created', callback);
    },

    onUpdated: (callback: (team: TrackedTeam) => void): (() => void) => {
      return addEventListener('team:updated', callback);
    },

    onDeleted: (callback: (teamName: string) => void): (() => void) => {
      return addEventListener('team:deleted', callback);
    },
  },

  // Plan operations
  plan: {
    getAll: async (): Promise<TrackedPlan[]> => {
      const response = await apiFetch<{ success: boolean; data: TrackedPlan[] }>('/api/plans');
      return response.data;
    },

    getByName: async (planName: string): Promise<TrackedPlan | null> => {
      const plans = await apiFetch<{ success: boolean; data: TrackedPlan[] }>('/api/plans');
      const plan = plans.data.find((p) => p.name === planName);
      return plan || null;
    },

    onCreated: (callback: (plan: TrackedPlan) => void): (() => void) => {
      return addEventListener('plan:created', callback);
    },

    onUpdated: (callback: (plan: TrackedPlan) => void): (() => void) => {
      return addEventListener('plan:updated', callback);
    },

    onDeleted: (callback: (planName: string) => void): (() => void) => {
      return addEventListener('plan:deleted', callback);
    },
  },

  // Proxy operations (web preview tunneling)
  proxy: {
    getConfig: async (): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> => {
      try {
        const response = await apiFetch<{ success: boolean; data: ProxyConfig }>(
          '/api/proxy/config'
        );
        return response;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get config',
        };
      }
    },

    updateConfig: async (
      config: Partial<ProxyConfig>
    ): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> => {
      try {
        const response = await apiFetch<{ success: boolean; data: ProxyConfig }>(
          '/api/proxy/config',
          {
            method: 'PUT',
            body: JSON.stringify(config),
          }
        );
        return response;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update config',
        };
      }
    },

    getPorts: async (): Promise<{ success: boolean; data?: AllowedPort[]; error?: string }> => {
      try {
        const response = await apiFetch<{ success: boolean; data: AllowedPort[] }>(
          '/api/proxy/ports'
        );
        return response;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get ports',
        };
      }
    },

    addPort: async (
      port: number,
      description?: string
    ): Promise<{ success: boolean; data?: AllowedPort; error?: string }> => {
      try {
        const response = await apiFetch<{ success: boolean; data: AllowedPort }>(
          '/api/proxy/ports',
          {
            method: 'POST',
            body: JSON.stringify({ port, description }),
          }
        );
        return response;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add port',
        };
      }
    },

    removePort: async (port: number): Promise<{ success: boolean; error?: string }> => {
      try {
        await apiFetch<{ success: boolean }>(`/api/proxy/ports/${port}`, { method: 'DELETE' });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove port',
        };
      }
    },
  },

  // DevTools operations (for web preview console capture)
  devtools: {
    registerView: (viewId: string, instanceId: string): { success: boolean } => {
      try {
        if (socket?.connected) {
          socket.emit('devtools:registerView', { viewId, instanceId });
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },

    unregisterView: (viewId: string): { success: boolean } => {
      try {
        if (socket?.connected) {
          socket.emit('devtools:unregisterView', { viewId });
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },

    addConsoleEntry: (
      viewId: string,
      entry: {
        level: 'log' | 'warn' | 'error' | 'info' | 'debug';
        message: string;
        timestamp: number;
        source?: string;
        line?: number;
      }
    ): { success: boolean } => {
      try {
        // Send via WebSocket for real-time sync
        if (socket?.connected) {
          socket.emit('devtools:console', { viewId, entry });
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },

    clearConsole: (viewId: string): { success: boolean } => {
      try {
        if (socket?.connected) {
          socket.emit('devtools:clearConsole', { viewId });
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },

    toggleInspector: (viewId: string, enabled?: boolean): { success: boolean } => {
      try {
        if (socket?.connected) {
          socket.emit('devtools:toggleInspector', { viewId, enabled });
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    },
  },
};

// Initialize on module load
if (isAuthenticated()) {
  connectSocket();
}
