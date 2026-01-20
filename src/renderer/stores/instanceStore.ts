import { create } from 'zustand';
import type {
  ClaudeInstance,
  ShellInstance,
  ShellInstanceStatus,
  ClaudeModel,
  InstanceMode,
  InstanceStatus,
  StreamMessage,
  Conversation,
  ConversationMessage,
} from '@shared/types';
import { useConversationStore } from './conversationStore';

// Buffer limits to prevent memory issues
const MAX_MESSAGES_PER_INSTANCE = 1000;
const MAX_RAW_OUTPUT_SIZE = 500000; // 500KB

// Activity tracking for timeline
export interface InstanceActivity {
  lastTool?: string;
  lastToolTime?: number;
  recentFiles: string[];
  toolCount: number;
}

/**
 * Type guard to validate if an object is a valid StreamMessage
 */
function isStreamMessage(obj: unknown): obj is StreamMessage {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const candidate = obj as Record<string, unknown>;
  // StreamMessage must have a 'type' field with specific values
  return (
    typeof candidate.type === 'string' &&
    ['system', 'assistant', 'user', 'result'].includes(candidate.type)
  );
}

/**
 * Safely parse a JSON string into a StreamMessage
 */
function parseStreamMessage(content: string, fallbackType: string): StreamMessage {
  try {
    const parsed: unknown = JSON.parse(content);
    if (isStreamMessage(parsed)) {
      return parsed;
    }
    // Parsed but not a valid StreamMessage, wrap it
    return { type: fallbackType as StreamMessage['type'], result: content };
  } catch {
    // Failed to parse, return as result
    return { type: fallbackType as StreamMessage['type'], result: content };
  }
}

interface InstanceOutput {
  instanceId: string;
  messages: StreamMessage[];
  rawOutput: string;
  conversationId?: string;
}

interface ShellOutput {
  shellId: string;
  rawOutput: string;
}

interface InstanceState {
  instances: ClaudeInstance[];
  outputs: Map<string, InstanceOutput>;
  instanceConversations: Map<string, string>; // instanceId -> conversationId
  activities: Map<string, InstanceActivity>; // instanceId -> activity data
  selectedInstanceId: string | null;
  // Timestamp of last explicit selection (to prevent sync from overriding recent selections)
  lastSelectionTime: number;
  isLoading: boolean;
  error: string | null;

  // Shell state
  shellInstances: ShellInstance[];
  shellOutputs: Map<string, ShellOutput>;
  selectedShellId: string | null;

  // Actions
  createInstance: (config: {
    projectId: string;
    model: ClaudeModel;
    mode: InstanceMode;
    prompt?: string;
    planMode?: boolean;
  }) => Promise<ClaudeInstance>;
  resumeConversation: (conversation: Conversation) => Promise<ClaudeInstance>;
  killInstance: (id: string) => Promise<void>;
  removeInstance: (id: string) => void;
  sendInput: (id: string, input: string) => Promise<void>;
  selectInstance: (id: string | null) => void;
  loadInstances: () => Promise<void>;

  // Sync state from server (for web clients)
  syncInstances: (
    instances: ClaudeInstance[],
    outputs?: Record<string, { messages: StreamMessage[]; rawOutput: string }>,
    instanceConversationMappings?: Record<string, string>
  ) => void;

  // Internal actions for IPC events
  updateInstanceStatus: (id: string, status: InstanceStatus) => void;
  updateTerminalTitle: (id: string, title: string) => void;
  addInstanceOutput: (id: string, message: StreamMessage) => void;
  addRawOutput: (id: string, data: string) => void;
  setInstanceError: (id: string, error: string) => void;
  handleInstanceExit: (id: string, code: number) => void;
  handleSessionId: (instanceId: string, sessionId: string) => void;
  updateActivity: (instanceId: string, activity: Partial<InstanceActivity>) => void;

  // Setup listeners
  setupListeners: () => () => void;

  // Selectors
  getInstancesByProject: (projectId: string) => ClaudeInstance[];
  getSelectedInstance: () => ClaudeInstance | undefined;
  getInstanceOutput: (id: string) => InstanceOutput | undefined;
  getConversationIdForInstance: (instanceId: string) => string | undefined;
  getInstanceForConversation: (conversationId: string) => ClaudeInstance | undefined;
  getInstanceOutputForConversation: (conversationId: string) => InstanceOutput | undefined;
  getActivity: (instanceId: string) => InstanceActivity | undefined;

  // Shell actions
  createShellInstance: (projectId: string) => Promise<ShellInstance>;
  killShellInstance: (id: string) => Promise<void>;
  removeShellInstance: (id: string) => void;
  sendShellInput: (id: string, input: string) => Promise<void>;
  selectShell: (id: string | null) => void;

  // Shell internal actions for IPC events
  updateShellStatus: (id: string, status: ShellInstanceStatus) => void;
  addShellRawOutput: (id: string, data: string) => void;
  handleShellExit: (id: string, code: number) => void;

  // Shell selectors
  getShellsByProject: (projectId: string) => ShellInstance[];
  getSelectedShell: () => ShellInstance | undefined;
  getShellOutput: (id: string) => ShellOutput | undefined;
}

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  outputs: new Map(),
  instanceConversations: new Map(),
  activities: new Map(),
  selectedInstanceId: null,
  lastSelectionTime: 0,
  isLoading: false,
  error: null,

  // Shell initial state
  shellInstances: [],
  shellOutputs: new Map(),
  selectedShellId: null,

  createInstance: async (config) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.instance.create(config);
      // Result includes instance data + conversationId
      const { conversationId, ...instance } = result as {
        conversationId?: string;
      } & ClaudeInstance;

      // Check if this is a remote instance placeholder (id: 'pending')
      // Remote instances are created on another node and will appear via cluster state updates
      if (instance.id === 'pending') {
        set({ isLoading: false });
        // Don't add placeholder to local instances - the real instance will appear
        // in globalInstances when the cluster state updates
        return instance;
      }

      // Initialize output storage
      const outputs = new Map(get().outputs);
      outputs.set(instance.id, {
        instanceId: instance.id,
        messages: [],
        rawOutput: '',
        conversationId,
      });

      // Map instance to conversation if we have one
      const instanceConversations = new Map(get().instanceConversations);
      if (conversationId) {
        instanceConversations.set(instance.id, conversationId);
      }

      set((state) => {
        // Check if instance already exists (can happen with web client sync)
        const exists = state.instances.some((i) => i.id === instance.id);
        return {
          instances: exists ? state.instances : [...state.instances, instance],
          outputs,
          instanceConversations,
          selectedInstanceId: instance.id,
          selectedShellId: null, // Clear shell selection when creating instance
          lastSelectionTime: Date.now(),
          isLoading: false,
        };
      });

      return instance;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create instance',
        isLoading: false,
      });
      throw error;
    }
  },

  resumeConversation: async (conversation) => {
    set({ isLoading: true, error: null });
    try {
      if (!conversation.sessionId) {
        throw new Error('Cannot resume conversation without sessionId');
      }

      // Load previous messages
      const previousMessages = await window.electronAPI.conversation.getMessages(conversation.id);

      // Resume instance with --resume flag
      const instance = await window.electronAPI.instance.resume({
        projectId: conversation.projectId,
        sessionId: conversation.sessionId,
        model: conversation.model,
        mode: conversation.mode,
      });

      // Initialize output storage with previous messages
      const outputs = new Map(get().outputs);
      const parsedMessages: StreamMessage[] = previousMessages.map((msg: ConversationMessage) =>
        parseStreamMessage(msg.content, msg.type)
      );

      outputs.set(instance.id, {
        instanceId: instance.id,
        messages: parsedMessages,
        rawOutput: '',
        conversationId: conversation.id,
      });

      // Map instance to conversation
      const instanceConversations = new Map(get().instanceConversations);
      instanceConversations.set(instance.id, conversation.id);

      // Update conversation status to active
      await useConversationStore.getState().updateConversation(conversation.id, {
        status: 'active',
      });

      set((state) => ({
        instances: [...state.instances, instance],
        outputs,
        instanceConversations,
        selectedInstanceId: instance.id,
        selectedShellId: null, // Clear shell selection when resuming conversation
        lastSelectionTime: Date.now(),
        isLoading: false,
      }));

      return instance;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume conversation',
        isLoading: false,
      });
      throw error;
    }
  },

  killInstance: async (id) => {
    try {
      await window.electronAPI.instance.kill(id);
      // Remove instance from store after killing
      get().removeInstance(id);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to kill instance',
      });
    }
  },

  removeInstance: (id) => {
    set((state) => {
      const outputs = new Map(state.outputs);
      outputs.delete(id);

      const instanceConversations = new Map(state.instanceConversations);
      instanceConversations.delete(id);

      const activities = new Map(state.activities);
      activities.delete(id);

      // If the removed instance was selected, select another one or null
      let newSelectedId = state.selectedInstanceId;
      if (state.selectedInstanceId === id) {
        const remainingInstances = state.instances.filter((inst) => inst.id !== id);
        newSelectedId = remainingInstances.length > 0 ? remainingInstances[0].id : null;
      }

      return {
        instances: state.instances.filter((inst) => inst.id !== id),
        outputs,
        instanceConversations,
        activities,
        selectedInstanceId: newSelectedId,
      };
    });
  },

  sendInput: async (id, input) => {
    try {
      await window.electronAPI.instance.sendInput(id, input);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to send input',
      });
    }
  },

  selectInstance: (id) => {
    set({ selectedInstanceId: id, lastSelectionTime: Date.now() });
  },

  loadInstances: async () => {
    try {
      const instances = await window.electronAPI.instance.getAll();
      set({ instances });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load instances',
      });
    }
  },

  syncInstances: (instances, outputs, instanceConversationMappings) => {
    const currentState = get();
    const newOutputs = new Map(currentState.outputs);
    const newInstanceConversations = new Map(currentState.instanceConversations);

    // Build a map of server instances for quick lookup
    const serverInstanceMap = new Map(instances.map((i) => [i.id, i]));

    // Merge strategy:
    // 1. Keep local instances that have terminal status (completed/error/killed) and are NOT in server list
    //    (server has already cleaned them up, but we want to keep showing them)
    // 2. Update/add instances that come from the server
    // 3. Remove instances that are in "running" state locally but not in server (they were killed externally)
    const terminalStatuses: InstanceStatus[] = ['completed', 'error', 'killed'];

    // Start with local instances that should be preserved (terminal status, not in server)
    const preservedLocalInstances = currentState.instances.filter((localInst) => {
      const isInServer = serverInstanceMap.has(localInst.id);
      const hasTerminalStatus = terminalStatuses.includes(localInst.status);
      // Preserve if it's terminal AND not in server (server cleaned it up)
      return hasTerminalStatus && !isInServer;
    });

    // Merge: server instances + preserved local instances
    const mergedInstances = [
      ...instances, // All instances from server (these are authoritative for active instances)
      ...preservedLocalInstances, // Local terminal instances not in server
    ];

    // Sync instances from server - initialize outputs for new instances
    instances.forEach((instance) => {
      // Initialize output storage for each instance if not exists
      if (!newOutputs.has(instance.id)) {
        newOutputs.set(instance.id, {
          instanceId: instance.id,
          messages: [],
          rawOutput: '',
        });
      }
    });

    // Sync output buffers if provided
    if (outputs) {
      Object.entries(outputs).forEach(([instanceId, output]) => {
        const existing = newOutputs.get(instanceId);
        newOutputs.set(instanceId, {
          instanceId,
          messages: output.messages || [],
          rawOutput: output.rawOutput || '',
          conversationId: existing?.conversationId,
        });
      });
    }

    // Sync instance-conversation mappings if provided
    if (instanceConversationMappings) {
      Object.entries(instanceConversationMappings).forEach(([instanceId, conversationId]) => {
        newInstanceConversations.set(instanceId, conversationId);
        // Also update the output's conversationId if it exists
        const output = newOutputs.get(instanceId);
        if (output) {
          newOutputs.set(instanceId, { ...output, conversationId });
        }
      });
    }

    // Preserve selectedInstanceId if:
    // 1. The instance still exists in the merged list, OR
    // 2. The selection was made very recently (within 2 seconds) - to handle race conditions
    const currentSelectedId = currentState.selectedInstanceId;
    const lastSelectionTime = currentState.lastSelectionTime;
    const isRecentSelection = Date.now() - lastSelectionTime < 2000;
    const selectedStillExists =
      currentSelectedId && mergedInstances.some((i) => i.id === currentSelectedId);

    // Don't override recent explicit selections (handles race condition with createInstance)
    const shouldPreserveSelection = selectedStillExists || isRecentSelection;

    set({
      instances: mergedInstances,
      outputs: newOutputs,
      instanceConversations: newInstanceConversations,
      selectedInstanceId: shouldPreserveSelection ? currentSelectedId : null,
    });
  },

  updateInstanceStatus: (id, status) => {
    set((state) => ({
      instances: state.instances.map((inst) => (inst.id === id ? { ...inst, status } : inst)),
    }));
  },

  updateTerminalTitle: (id, title) => {
    set((state) => ({
      instances: state.instances.map((inst) =>
        inst.id === id ? { ...inst, terminalTitle: title } : inst
      ),
    }));

    // Also update the conversation title
    const conversationId = get().instanceConversations.get(id);
    if (conversationId) {
      useConversationStore
        .getState()
        .updateConversation(conversationId, {
          title,
        })
        .catch(console.error);
    }
  },

  addInstanceOutput: (id, message) => {
    const state = get();
    const outputs = new Map(state.outputs);
    const existing = outputs.get(id) || {
      instanceId: id,
      messages: [],
      rawOutput: '',
    };

    // Add message and trim if over limit
    let messages = [...existing.messages, message];
    if (messages.length > MAX_MESSAGES_PER_INSTANCE) {
      messages = messages.slice(-MAX_MESSAGES_PER_INSTANCE);
    }

    outputs.set(id, {
      ...existing,
      messages,
    });

    set({ outputs });

    // Persist message to conversation if linked
    const conversationId = existing.conversationId || state.instanceConversations.get(id);
    if (conversationId) {
      window.electronAPI.conversation
        .addMessage({
          conversationId,
          type: message.type,
          content: JSON.stringify(message),
          costUsd: message.cost_usd,
        })
        .catch(console.error);
    }
  },

  addRawOutput: (id, data) => {
    set((state) => {
      const outputs = new Map(state.outputs);
      const existing = outputs.get(id) || {
        instanceId: id,
        messages: [],
        rawOutput: '',
      };

      // Append and trim if over limit
      let rawOutput = existing.rawOutput + data;
      if (rawOutput.length > MAX_RAW_OUTPUT_SIZE) {
        rawOutput = rawOutput.slice(-MAX_RAW_OUTPUT_SIZE);
      }

      outputs.set(id, {
        ...existing,
        rawOutput,
      });
      return { outputs };
    });
  },

  setInstanceError: (id, error) => {
    set((state) => ({
      instances: state.instances.map((inst) =>
        inst.id === id ? { ...inst, status: 'error' as const, error } : inst
      ),
    }));
  },

  handleInstanceExit: (id, code) => {
    const state = get();
    const conversationId = state.instanceConversations.get(id);
    const newStatus = code === 0 ? 'completed' : 'error';

    set((state) => ({
      instances: state.instances.map((inst) => {
        if (inst.id !== id) return inst;
        if (inst.status === 'killed') return inst;
        return {
          ...inst,
          status: newStatus as InstanceStatus,
        };
      }),
    }));

    // Update conversation status
    if (conversationId) {
      useConversationStore
        .getState()
        .updateConversation(conversationId, {
          status: newStatus === 'completed' ? 'completed' : 'error',
        })
        .catch(console.error);
    }
  },

  handleSessionId: (instanceId, sessionId) => {
    const conversationId = get().instanceConversations.get(instanceId);
    if (conversationId) {
      useConversationStore
        .getState()
        .updateConversation(conversationId, {
          sessionId,
        })
        .catch(console.error);
    }
  },

  updateActivity: (instanceId, activity) => {
    set((state) => {
      const activities = new Map(state.activities);
      const existing = activities.get(instanceId) || {
        recentFiles: [],
        toolCount: 0,
      };

      // Merge the activity update
      const updated: InstanceActivity = {
        ...existing,
        ...activity,
        recentFiles: activity.recentFiles
          ? [...new Set([...activity.recentFiles, ...existing.recentFiles])].slice(0, 10)
          : existing.recentFiles,
        toolCount: activity.lastTool ? existing.toolCount + 1 : existing.toolCount,
      };

      activities.set(instanceId, updated);
      return { activities };
    });
  },

  setupListeners: () => {
    const {
      updateInstanceStatus,
      updateTerminalTitle,
      addInstanceOutput,
      addRawOutput,
      setInstanceError,
      handleInstanceExit,
      handleSessionId,
      syncInstances,
      updateShellStatus,
      addShellRawOutput,
      handleShellExit,
      updateActivity,
    } = get();

    const unsubOutput = window.electronAPI.instance.onOutput((id, message) => {
      addInstanceOutput(id, message);
    });

    const unsubStatus = window.electronAPI.instance.onStatus((id, status) => {
      updateInstanceStatus(id, status);
    });

    const unsubError = window.electronAPI.instance.onError((id, error) => {
      setInstanceError(id, error);
    });

    const unsubExit = window.electronAPI.instance.onExit((id, code) => {
      handleInstanceExit(id, code);
    });

    const unsubRaw = window.electronAPI.instance.onRawOutput((id, data) => {
      addRawOutput(id, data);
    });

    const unsubSessionId = window.electronAPI.instance.onSessionId((id, sessionId) => {
      handleSessionId(id, sessionId);
    });

    const unsubTerminalTitle = window.electronAPI.instance.onTerminalTitle((id, title) => {
      updateTerminalTitle(id, title);
    });

    // Instance sync listener (for updates from web clients or other sources)
    const unsubSync = window.electronAPI.instance.onSync((instances) => {
      syncInstances(instances);
    });

    // Shell event listeners
    const unsubShellRawOutput = window.electronAPI.shell.onRawOutput((id, data) => {
      addShellRawOutput(id, data);
    });

    const unsubShellStatus = window.electronAPI.shell.onStatus((id, status) => {
      updateShellStatus(id, status);
    });

    const unsubShellExit = window.electronAPI.shell.onExit((id, code) => {
      handleShellExit(id, code);
    });

    // Listen for sync:state events from web socket (for web clients)
    const handleSyncState = (event: Event) => {
      const customEvent = event as CustomEvent<{
        instanceConversations?: Record<string, string>;
        instances?: ClaudeInstance[];
        outputs?: Record<string, { messages: StreamMessage[]; rawOutput: string }>;
      }>;
      if (customEvent.detail?.instances) {
        syncInstances(
          customEvent.detail.instances,
          customEvent.detail.outputs,
          customEvent.detail.instanceConversations
        );
      }
    };
    window.addEventListener('sync:state', handleSyncState);

    // Listen for hook:activity events (real-time tool use tracking)
    const handleHookActivity = (event: Event) => {
      const customEvent = event as CustomEvent<{
        instanceId: string;
        toolName?: string;
        files?: string[];
        timestamp: number;
      }>;
      if (customEvent.detail?.instanceId) {
        updateActivity(customEvent.detail.instanceId, {
          lastTool: customEvent.detail.toolName,
          lastToolTime: customEvent.detail.timestamp,
          recentFiles: customEvent.detail.files || [],
        });
      }
    };
    window.addEventListener('hook:activity', handleHookActivity);

    // Also listen via IPC if available
    let unsubActivity: (() => void) | undefined;
    const hookApi = window.electronAPI?.hook;
    if (hookApi?.onActivity) {
      unsubActivity = hookApi.onActivity((_event, data) => {
        updateActivity(data.instanceId, {
          lastTool: data.toolName,
          lastToolTime: data.timestamp,
          recentFiles: data.files || [],
        });
      });
    }

    return () => {
      unsubOutput();
      unsubStatus();
      unsubError();
      unsubExit();
      unsubRaw();
      unsubSessionId();
      unsubTerminalTitle();
      unsubSync();
      unsubShellRawOutput();
      unsubShellStatus();
      unsubShellExit();
      window.removeEventListener('sync:state', handleSyncState);
      window.removeEventListener('hook:activity', handleHookActivity);
      unsubActivity?.();
    };
  },

  getInstancesByProject: (projectId) => {
    return get().instances.filter((inst) => inst.projectId === projectId);
  },

  getSelectedInstance: () => {
    const state = get();
    return state.instances.find((inst) => inst.id === state.selectedInstanceId);
  },

  getInstanceOutput: (id) => {
    return get().outputs.get(id);
  },

  getConversationIdForInstance: (instanceId) => {
    return get().instanceConversations.get(instanceId);
  },

  getInstanceForConversation: (conversationId) => {
    const state = get();
    for (const [instanceId, convId] of state.instanceConversations.entries()) {
      if (convId === conversationId) {
        return state.instances.find((i) => i.id === instanceId);
      }
    }
    return undefined;
  },

  getInstanceOutputForConversation: (conversationId) => {
    const state = get();
    for (const [instanceId, convId] of state.instanceConversations.entries()) {
      if (convId === conversationId) {
        return state.outputs.get(instanceId);
      }
    }
    return undefined;
  },

  getActivity: (instanceId) => {
    return get().activities.get(instanceId);
  },

  // ==================== Shell Actions ====================

  createShellInstance: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      const shell = await window.electronAPI.shell.create(projectId);

      // Initialize output storage
      const shellOutputs = new Map(get().shellOutputs);
      shellOutputs.set(shell.id, {
        shellId: shell.id,
        rawOutput: '',
      });

      set((state) => ({
        shellInstances: [...state.shellInstances, shell],
        shellOutputs,
        selectedShellId: shell.id,
        selectedInstanceId: null, // Deselect claude instance when selecting shell
        isLoading: false,
      }));

      return shell;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create shell',
        isLoading: false,
      });
      throw error;
    }
  },

  killShellInstance: async (id) => {
    try {
      await window.electronAPI.shell.kill(id);
      get().removeShellInstance(id);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to kill shell',
      });
    }
  },

  removeShellInstance: (id) => {
    set((state) => {
      const shellOutputs = new Map(state.shellOutputs);
      shellOutputs.delete(id);

      // If the removed shell was selected, select another one or null
      let newSelectedShellId = state.selectedShellId;
      if (state.selectedShellId === id) {
        const remainingShells = state.shellInstances.filter((s) => s.id !== id);
        newSelectedShellId = remainingShells.length > 0 ? remainingShells[0].id : null;
      }

      return {
        shellInstances: state.shellInstances.filter((s) => s.id !== id),
        shellOutputs,
        selectedShellId: newSelectedShellId,
      };
    });
  },

  sendShellInput: async (id, input) => {
    try {
      await window.electronAPI.shell.sendInput(id, input);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to send input to shell',
      });
    }
  },

  selectShell: (id) => {
    set({
      selectedShellId: id,
      selectedInstanceId: id ? null : get().selectedInstanceId, // Deselect claude instance when selecting shell
    });
  },

  updateShellStatus: (id, status) => {
    set((state) => ({
      shellInstances: state.shellInstances.map((s) => (s.id === id ? { ...s, status } : s)),
    }));
  },

  addShellRawOutput: (id, data) => {
    set((state) => {
      const shellOutputs = new Map(state.shellOutputs);
      const existing = shellOutputs.get(id) || {
        shellId: id,
        rawOutput: '',
      };

      // Append and trim if over limit
      let rawOutput = existing.rawOutput + data;
      if (rawOutput.length > MAX_RAW_OUTPUT_SIZE) {
        rawOutput = rawOutput.slice(-MAX_RAW_OUTPUT_SIZE);
      }

      shellOutputs.set(id, {
        ...existing,
        rawOutput,
      });
      return { shellOutputs };
    });
  },

  handleShellExit: (id, code) => {
    const newStatus = code === 0 ? 'completed' : 'error';

    set((state) => ({
      shellInstances: state.shellInstances.map((s) => {
        if (s.id !== id) return s;
        if (s.status === 'killed') return s;
        return {
          ...s,
          status: newStatus as ShellInstanceStatus,
        };
      }),
    }));
  },

  getShellsByProject: (projectId) => {
    return get().shellInstances.filter((s) => s.projectId === projectId);
  },

  getSelectedShell: () => {
    const state = get();
    return state.shellInstances.find((s) => s.id === state.selectedShellId);
  },

  getShellOutput: (id) => {
    return get().shellOutputs.get(id);
  },
}));
