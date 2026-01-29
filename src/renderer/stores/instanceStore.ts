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
  SplitTab,
  InstanceViewMode,
} from '@shared/types';
import type {
  PermissionPromptRequest,
  PermissionPromptResponse,
} from '@shared/types/permissionPrompt';
import { useConversationStore } from './conversationStore';
import { useUIStore } from './uiStore';

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
  // Track instances being removed to prevent re-adding via sync
  removingInstanceIds: Set<string>;
  // Buffer for status updates that arrive before instance is added to store
  // This prevents race condition where status event arrives before REST response is processed
  pendingStatuses: Map<string, InstanceStatus>;

  // Shell state
  shellInstances: ShellInstance[];
  shellOutputs: Map<string, ShellOutput>;
  selectedShellId: string | null;

  // Split tab state
  splitTabs: Map<string, SplitTab>;
  activeSplitId: string | null;

  // Permission prompt state (for structured view)
  pendingPermissions: Map<string, PermissionPromptRequest>;

  // Actions
  createInstance: (config: {
    projectId: string;
    model: ClaudeModel;
    mode: InstanceMode;
    prompt?: string;
    planMode?: boolean;
    verbose?: boolean;
    skipPermissions?: boolean;
    usePermissionPromptTool?: boolean;
  }) => Promise<ClaudeInstance>;

  // Create a pending instance (no Claude process yet) for structured view deferred flow
  createPendingInstance: (config: {
    projectId: string;
    model: ClaudeModel;
    mode: InstanceMode;
    planMode?: boolean;
    verbose?: boolean;
    skipPermissions?: boolean;
    usePermissionPromptTool?: boolean;
  }) => Promise<ClaudeInstance>;

  // Activate a pending instance with the first user message
  activatePendingInstance: (id: string, prompt: string) => Promise<ClaudeInstance>;

  resumeConversation: (conversation: Conversation) => Promise<ClaudeInstance>;
  // Resume a completed instance with a new prompt (for structured view continuation)
  resumeCompletedInstance: (instanceId: string, prompt: string) => Promise<ClaudeInstance>;
  killInstance: (id: string) => void;
  removeInstance: (id: string) => void;
  sendInput: (id: string, input: string) => Promise<void>;
  sendJsonMessage: (id: string, message: string) => Promise<void>; // For stream-json mode
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
  updateInstanceViewMode: (id: string, viewMode: InstanceViewMode) => void;
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

  // Split tab actions
  createSplit: (
    leftId: string,
    rightId: string,
    leftType: 'instance' | 'shell' | 'proxy',
    rightType: 'instance' | 'shell' | 'proxy'
  ) => void;
  removeSplit: (splitId: string) => void;
  selectSplit: (splitId: string | null) => void;
  getSplitForInstance: (instanceId: string) => SplitTab | undefined;
  getActiveSplit: () => SplitTab | undefined;

  // Permission prompt actions
  addPendingPermission: (request: PermissionPromptRequest) => void;
  removePendingPermission: (permissionId: string) => void;
  respondToPermission: (permissionId: string, response: PermissionPromptResponse) => Promise<void>;
  getPendingPermissionForInstance: (instanceId: string) => PermissionPromptRequest | undefined;
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
  removingInstanceIds: new Set(),
  pendingStatuses: new Map(),

  // Shell initial state
  shellInstances: [],
  shellOutputs: new Map(),
  selectedShellId: null,

  // Split tab initial state
  splitTabs: new Map(),
  activeSplitId: null,

  // Permission prompt initial state
  pendingPermissions: new Map(),

  createInstance: async (config) => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.instance.create(config);
      // Result includes instance data + conversationId
      const { conversationId, ...instanceData } = result as {
        conversationId?: string;
      } & ClaudeInstance;

      // Assign viewMode from uiStore (new instances use the current default viewMode)
      const currentViewMode = useUIStore.getState().viewMode as InstanceViewMode;
      const instance: ClaudeInstance = { ...instanceData, viewMode: currentViewMode };

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

        // Check for pending status that arrived before instance was added
        const pendingStatus = state.pendingStatuses.get(instance.id);
        const instanceWithStatus = pendingStatus
          ? { ...instance, status: pendingStatus }
          : instance;

        // Clear the pending status
        const pendingStatuses = new Map(state.pendingStatuses);
        pendingStatuses.delete(instance.id);

        return {
          instances: exists ? state.instances : [...state.instances, instanceWithStatus],
          outputs,
          instanceConversations,
          pendingStatuses,
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

  createPendingInstance: async (config) => {
    set({ isLoading: true, error: null });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (window.electronAPI.instance as any).createPending(config);
      const { conversationId, ...instanceData } = result as {
        conversationId?: string;
      } & ClaudeInstance;

      // Assign viewMode from uiStore
      const currentViewMode = useUIStore.getState().viewMode as InstanceViewMode;
      const instance: ClaudeInstance = { ...instanceData, viewMode: currentViewMode };

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
        const exists = state.instances.some((i) => i.id === instance.id);

        return {
          instances: exists ? state.instances : [...state.instances, instance],
          outputs,
          instanceConversations,
          selectedInstanceId: instance.id,
          selectedShellId: null,
          lastSelectionTime: Date.now(),
          isLoading: false,
        };
      });

      return instance;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create pending instance',
        isLoading: false,
      });
      throw error;
    }
  },

  activatePendingInstance: async (id, prompt) => {
    set({ isLoading: true, error: null });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (window.electronAPI.instance as any).activate(id, prompt);
      const instance: ClaudeInstance = result;

      // Update the store: replace the pending instance with the activated one
      set((state) => {
        // Get the old output buffer (from pending instance)
        const outputs = new Map(state.outputs);
        const oldOutput = outputs.get(id);
        // Check if messages already arrived with the new ID (race condition)
        const existingNewOutput = outputs.get(instance.id);

        // Transfer/merge to new ID if different
        if (instance.id !== id) {
          // Merge old buffer with any messages that already arrived for the new ID
          const mergedMessages = [
            ...(oldOutput?.messages || []),
            ...(existingNewOutput?.messages || []),
          ];
          const mergedRawOutput =
            (oldOutput?.rawOutput || '') + (existingNewOutput?.rawOutput || '');

          console.log(`[instanceStore] Merged messages count: ${mergedMessages.length}`);

          outputs.set(instance.id, {
            instanceId: instance.id,
            messages: mergedMessages,
            rawOutput: mergedRawOutput,
            conversationId: oldOutput?.conversationId || existingNewOutput?.conversationId,
          });
          outputs.delete(id);
        }

        // Update conversation mapping
        const instanceConversations = new Map(state.instanceConversations);
        const conversationId = instanceConversations.get(id);
        if (conversationId && instance.id !== id) {
          instanceConversations.set(instance.id, conversationId);
          instanceConversations.delete(id);
        }

        // Replace pending instance with activated instance
        const instances = state.instances.map((inst) =>
          inst.id === id ? { ...instance, viewMode: inst.viewMode } : inst
        );

        // If the ID changed, we need to update selectedInstanceId too
        const selectedInstanceId =
          state.selectedInstanceId === id ? instance.id : state.selectedInstanceId;

        return {
          instances,
          outputs,
          instanceConversations,
          selectedInstanceId,
          isLoading: false,
        };
      });

      return instance;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to activate instance',
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
      const instanceData = await window.electronAPI.instance.resume({
        projectId: conversation.projectId,
        sessionId: conversation.sessionId,
        model: conversation.model,
        mode: conversation.mode,
      });

      // Assign viewMode from uiStore (resumed instances use the current default viewMode)
      const currentViewMode = useUIStore.getState().viewMode as InstanceViewMode;
      const instance: ClaudeInstance = { ...instanceData, viewMode: currentViewMode };

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

      set((state) => {
        // Check if instance already exists (can happen with sync race condition)
        const exists = state.instances.some((i) => i.id === instance.id);

        // Check for pending status that arrived before instance was added
        const pendingStatus = state.pendingStatuses.get(instance.id);
        const instanceWithStatus = pendingStatus
          ? { ...instance, status: pendingStatus }
          : instance;

        // Clear the pending status
        const pendingStatuses = new Map(state.pendingStatuses);
        pendingStatuses.delete(instance.id);

        return {
          instances: exists ? state.instances : [...state.instances, instanceWithStatus],
          outputs,
          instanceConversations,
          pendingStatuses,
          selectedInstanceId: instance.id,
          selectedShellId: null, // Clear shell selection when resuming conversation
          lastSelectionTime: Date.now(),
          isLoading: false,
        };
      });

      return instance;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume conversation',
        isLoading: false,
      });
      throw error;
    }
  },

  resumeCompletedInstance: async (instanceId, prompt) => {
    const state = get();
    const instance = state.instances.find((i) => i.id === instanceId);

    if (!instance) {
      throw new Error('Instance not found');
    }

    if (!instance.sessionId) {
      throw new Error('Cannot resume instance without sessionId');
    }

    set({ isLoading: true, error: null });
    try {
      // Get existing output to preserve messages
      const existingOutput = state.outputs.get(instanceId);

      // Resume instance with the new prompt
      const newInstanceData = await window.electronAPI.instance.resume({
        projectId: instance.projectId,
        sessionId: instance.sessionId,
        model: instance.model,
        mode: instance.mode,
        prompt,
      });

      // Assign viewMode from current instance
      const newInstance: ClaudeInstance = {
        ...newInstanceData,
        viewMode: instance.viewMode,
        sessionId: instance.sessionId, // Preserve session ID
      };

      // Initialize output storage with existing messages
      const outputs = new Map(state.outputs);
      outputs.set(newInstance.id, {
        instanceId: newInstance.id,
        messages: existingOutput?.messages || [],
        rawOutput: '',
        conversationId: existingOutput?.conversationId,
      });

      // Copy conversation mapping
      const instanceConversations = new Map(state.instanceConversations);
      const conversationId = state.instanceConversations.get(instanceId);
      if (conversationId) {
        instanceConversations.set(newInstance.id, conversationId);
      }

      set((s) => ({
        // Replace old instance with new one
        instances: s.instances.map((i) => (i.id === instanceId ? newInstance : i)),
        outputs,
        instanceConversations,
        selectedInstanceId: newInstance.id,
        isLoading: false,
      }));

      return newInstance;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume instance',
        isLoading: false,
      });
      throw error;
    }
  },

  killInstance: (id) => {
    // Mark instance as being removed PERMANENTLY to prevent re-adding via sync
    // We don't clear this - the ID stays in the set forever for this session
    // This prevents ghost tabs from appearing when delayed syncs arrive
    set((state) => ({
      removingInstanceIds: new Set(state.removingInstanceIds).add(id),
    }));

    // Remove instance from UI immediately for responsive UX
    // The graceful kill runs in background - we don't wait for it
    get().removeInstance(id);

    // Fire and forget - graceful kill runs in background
    // This allows Claude to clean up background processes without blocking UI
    window.electronAPI.instance.kill(id).catch((error) => {
      // Log error but don't throw - instance may already be dead
      // or may be a remote/cluster instance that doesn't exist locally
      console.warn(`[instanceStore] Failed to kill instance ${id}:`, error);
    });
  },

  removeInstance: (id) => {
    set((state) => {
      const outputs = new Map(state.outputs);
      outputs.delete(id);

      const instanceConversations = new Map(state.instanceConversations);
      instanceConversations.delete(id);

      const activities = new Map(state.activities);
      activities.delete(id);

      // Check if this instance is part of a split
      const splitTabs = new Map(state.splitTabs);
      let newActiveSplitId = state.activeSplitId;
      let newSelectedId = state.selectedInstanceId;
      let newSelectedShellId = state.selectedShellId;

      for (const [splitId, split] of splitTabs) {
        if (split.leftInstanceId === id || split.rightInstanceId === id) {
          // Remove the split
          splitTabs.delete(splitId);
          if (state.activeSplitId === splitId) {
            newActiveSplitId = null;
            // Select the other instance/shell from the split
            const otherId =
              split.leftInstanceId === id ? split.rightInstanceId : split.leftInstanceId;
            const otherType = split.leftInstanceId === id ? split.rightType : split.leftType;
            if (otherType === 'instance') {
              newSelectedId = otherId;
              newSelectedShellId = null;
            } else {
              newSelectedShellId = otherId;
              newSelectedId = null;
            }
          }
          break;
        }
      }

      // If the removed instance was selected (and not part of a split), select another one or null
      if (state.selectedInstanceId === id && newSelectedId === state.selectedInstanceId) {
        const remainingInstances = state.instances.filter((inst) => inst.id !== id);
        newSelectedId = remainingInstances.length > 0 ? remainingInstances[0].id : null;
      }

      return {
        instances: state.instances.filter((inst) => inst.id !== id),
        outputs,
        instanceConversations,
        activities,
        splitTabs,
        activeSplitId: newActiveSplitId,
        selectedInstanceId: newSelectedId,
        selectedShellId: newSelectedShellId,
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

  sendJsonMessage: async (id, message) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window.electronAPI.instance as any).sendJsonMessage(id, message);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to send message',
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

    // Filter out instances that are being removed (prevents ghost tabs)
    const filteredServerInstances = instances.filter(
      (i) => !currentState.removingInstanceIds.has(i.id)
    );

    // Build a map of server instances for quick lookup
    const serverInstanceMap = new Map(filteredServerInstances.map((i) => [i.id, i]));

    // Merge strategy:
    // 1. Keep local instances that have terminal status (completed/error/killed) and are NOT in server list
    //    (server has already cleaned them up, but we want to keep showing them)
    // 2. Keep local instances that are very new (created in last 3 seconds) and not yet in server
    //    (prevents race condition where sync arrives before server knows about new instance)
    // 3. Update/add instances that come from the server (excluding those being removed)
    // 4. Remove instances that are in "running" state locally but not in server (they were killed externally)
    const terminalStatuses: InstanceStatus[] = ['completed', 'error', 'killed'];
    const recentCreationThreshold = 3000; // 3 seconds

    // Start with local instances that should be preserved
    const preservedLocalInstances = currentState.instances.filter((localInst) => {
      // Never preserve instances that are being removed
      if (currentState.removingInstanceIds.has(localInst.id)) return false;

      const isInServer = serverInstanceMap.has(localInst.id);

      // Already in server - don't preserve (server version is authoritative)
      if (isInServer) return false;

      const hasTerminalStatus = terminalStatuses.includes(localInst.status);
      // Preserve if it's terminal (server cleaned it up but we want to show it)
      if (hasTerminalStatus) return true;

      // Preserve if it was created very recently (race condition protection)
      // This prevents the "ghost tab" bug where a newly created instance disappears
      // because sync arrives before server knows about it
      const isRecentlyCreated = Date.now() - (localInst.createdAt || 0) < recentCreationThreshold;
      if (isRecentlyCreated) {
        return true;
      }

      return false;
    });

    // Apply pending statuses to server instances before merging
    // This handles the race condition where status events arrive before sync
    const pendingStatuses = new Map(currentState.pendingStatuses);

    // Build a map of local instances to preserve client-only properties (like viewMode)
    const localInstanceMap = new Map(currentState.instances.map((i) => [i.id, i]));

    const serverInstancesWithPendingStatus = filteredServerInstances.map((inst) => {
      const pendingStatus = pendingStatuses.get(inst.id);
      const localInstance = localInstanceMap.get(inst.id);

      // Preserve viewMode from local instance (server doesn't have this client-only property)
      const preservedViewMode = localInstance?.viewMode;

      if (pendingStatus) {
        pendingStatuses.delete(inst.id);
        return { ...inst, status: pendingStatus, viewMode: preservedViewMode };
      }
      return { ...inst, viewMode: preservedViewMode };
    });

    // Merge: server instances (excluding removed) + preserved local instances
    const mergedInstances = [
      ...serverInstancesWithPendingStatus, // All instances from server (with preserved viewMode)
      ...preservedLocalInstances, // Local terminal instances not in server + recently created
    ];

    // Sync instances from server - initialize outputs for new instances
    filteredServerInstances.forEach((instance) => {
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

    // Preserve selectedInstanceId ONLY if the instance exists in the merged list
    // The previous logic of preserving based on "recent selection" was buggy:
    // it could keep selectedInstanceId pointing to a non-existent instance,
    // causing a "ghost tab" to appear
    const currentSelectedId = currentState.selectedInstanceId;
    const selectedStillExists =
      currentSelectedId && mergedInstances.some((i) => i.id === currentSelectedId);

    set({
      instances: mergedInstances,
      outputs: newOutputs,
      instanceConversations: newInstanceConversations,
      pendingStatuses,
      selectedInstanceId: selectedStillExists ? currentSelectedId : null,
    });
  },

  updateInstanceStatus: (id, status) => {
    // Ignore updates for instances being removed (prevents ghost updates)
    if (get().removingInstanceIds.has(id)) return;

    const state = get();
    const instanceExists = state.instances.some((inst) => inst.id === id);

    if (instanceExists) {
      // Instance exists, update it directly
      set((state) => ({
        instances: state.instances.map((inst) => (inst.id === id ? { ...inst, status } : inst)),
      }));
    } else {
      // Instance not in store yet - buffer the status for when it's added
      // This handles race condition where status event arrives before REST response
      const pendingStatuses = new Map(state.pendingStatuses);
      pendingStatuses.set(id, status);
      set({ pendingStatuses });
    }
  },

  updateTerminalTitle: (id, title) => {
    // Ignore updates for instances being removed
    if (get().removingInstanceIds.has(id)) return;

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

  updateInstanceViewMode: (id, viewMode) => {
    // Ignore updates for instances being removed
    if (get().removingInstanceIds.has(id)) return;

    set((state) => ({
      instances: state.instances.map((inst) => (inst.id === id ? { ...inst, viewMode } : inst)),
    }));
  },

  addInstanceOutput: (id, message) => {
    // Ignore output for instances being removed
    if (get().removingInstanceIds.has(id)) return;

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

    // DEBUG: Log message count
    console.log(`[instanceStore] Buffer now has ${messages.length} messages for ${id}`);

    outputs.set(id, {
      ...existing,
      messages,
    });

    set({ outputs });

    // NOTE: Message persistence is handled by ProcessManager in the main process
    // to avoid double-writes. See ProcessManager.ts setupInstanceListeners()
  },

  addRawOutput: (id, data) => {
    // Ignore output for instances being removed
    if (get().removingInstanceIds.has(id)) return;

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
    // Ignore errors for instances being removed
    if (get().removingInstanceIds.has(id)) return;

    set((state) => ({
      instances: state.instances.map((inst) =>
        inst.id === id ? { ...inst, status: 'error' as const, error } : inst
      ),
    }));
  },

  handleInstanceExit: (id, code) => {
    // Ignore exit events for instances being removed
    if (get().removingInstanceIds.has(id)) return;

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
    // Ignore for instances being removed
    if (get().removingInstanceIds.has(instanceId)) return;

    // Update instance with sessionId for resume capability
    set((state) => ({
      instances: state.instances.map((inst) =>
        inst.id === instanceId ? { ...inst, sessionId } : inst
      ),
    }));

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
    // Ignore for instances being removed
    if (get().removingInstanceIds.has(instanceId)) return;

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
      addPendingPermission,
      removePendingPermission,
    } = get();

    // Check if electronAPI is available (not available in Vite dev mode)
    const hasElectronAPI =
      typeof window !== 'undefined' &&
      'electronAPI' in window &&
      window.electronAPI?.instance !== undefined;

    // Only set up Electron IPC listeners if electronAPI is available
    let unsubOutput: (() => void) | undefined;
    let unsubStatus: (() => void) | undefined;
    let unsubError: (() => void) | undefined;
    let unsubExit: (() => void) | undefined;
    let unsubRaw: (() => void) | undefined;
    let unsubSessionId: (() => void) | undefined;
    let unsubTerminalTitle: (() => void) | undefined;
    let unsubSync: (() => void) | undefined;
    let unsubShellRawOutput: (() => void) | undefined;
    let unsubShellStatus: (() => void) | undefined;
    let unsubShellExit: (() => void) | undefined;
    let unsubPermissionRequest: (() => void) | undefined;
    let unsubPermissionTimeout: (() => void) | undefined;

    if (hasElectronAPI) {
      unsubOutput = window.electronAPI.instance.onOutput((id, message) => {
        addInstanceOutput(id, message);
      });

      unsubStatus = window.electronAPI.instance.onStatus((id, status) => {
        updateInstanceStatus(id, status);
      });

      unsubError = window.electronAPI.instance.onError((id, error) => {
        setInstanceError(id, error);
      });

      unsubExit = window.electronAPI.instance.onExit((id, code) => {
        handleInstanceExit(id, code);
      });

      unsubRaw = window.electronAPI.instance.onRawOutput((id, data) => {
        addRawOutput(id, data);
      });

      unsubSessionId = window.electronAPI.instance.onSessionId((id, sessionId) => {
        handleSessionId(id, sessionId);
      });

      unsubTerminalTitle = window.electronAPI.instance.onTerminalTitle((id, title) => {
        updateTerminalTitle(id, title);
      });

      // Instance sync listener (for updates from web clients or other sources)
      unsubSync = window.electronAPI.instance.onSync((instances) => {
        syncInstances(instances);
      });

      // Shell event listeners
      unsubShellRawOutput = window.electronAPI.shell.onRawOutput((id, data) => {
        addShellRawOutput(id, data);
      });

      unsubShellStatus = window.electronAPI.shell.onStatus((id, status) => {
        updateShellStatus(id, status);
      });

      unsubShellExit = window.electronAPI.shell.onExit((id, code) => {
        handleShellExit(id, code);
      });

      // Permission prompt listeners (for structured view)
      const permissionPromptApi = window.electronAPI?.permissionPrompt;
      if (permissionPromptApi) {
        unsubPermissionRequest = permissionPromptApi.onRequest((request) => {
          console.log('[instanceStore] Permission request received:', request.id, request.toolName);
          addPendingPermission(request);
        });

        unsubPermissionTimeout = permissionPromptApi.onTimeout((request) => {
          console.log('[instanceStore] Permission request timed out:', request.id);
          removePendingPermission(request.id);
        });
      }
    }

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
      unsubOutput?.();
      unsubStatus?.();
      unsubError?.();
      unsubExit?.();
      unsubRaw?.();
      unsubSessionId?.();
      unsubTerminalTitle?.();
      unsubSync?.();
      unsubShellRawOutput?.();
      unsubShellStatus?.();
      unsubShellExit?.();
      window.removeEventListener('sync:state', handleSyncState);
      window.removeEventListener('hook:activity', handleHookActivity);
      unsubActivity?.();
      unsubPermissionRequest?.();
      unsubPermissionTimeout?.();
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

      // Check if this shell is part of a split
      const splitTabs = new Map(state.splitTabs);
      let newActiveSplitId = state.activeSplitId;
      let newSelectedId = state.selectedInstanceId;
      let newSelectedShellId = state.selectedShellId;

      for (const [splitId, split] of splitTabs) {
        if (split.leftInstanceId === id || split.rightInstanceId === id) {
          // Remove the split
          splitTabs.delete(splitId);
          if (state.activeSplitId === splitId) {
            newActiveSplitId = null;
            // Select the other instance/shell from the split
            const otherId =
              split.leftInstanceId === id ? split.rightInstanceId : split.leftInstanceId;
            const otherType = split.leftInstanceId === id ? split.rightType : split.leftType;
            if (otherType === 'instance') {
              newSelectedId = otherId;
              newSelectedShellId = null;
            } else {
              newSelectedShellId = otherId;
              newSelectedId = null;
            }
          }
          break;
        }
      }

      // If the removed shell was selected (and not part of a split), select another one or null
      if (state.selectedShellId === id && newSelectedShellId === state.selectedShellId) {
        const remainingShells = state.shellInstances.filter((s) => s.id !== id);
        newSelectedShellId = remainingShells.length > 0 ? remainingShells[0].id : null;
      }

      return {
        shellInstances: state.shellInstances.filter((s) => s.id !== id),
        shellOutputs,
        splitTabs,
        activeSplitId: newActiveSplitId,
        selectedInstanceId: newSelectedId,
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

  // ==================== Split Tab Actions ====================

  createSplit: (leftId, rightId, leftType, rightType) => {
    const splitId = `split-${Date.now()}`;
    const newSplit: SplitTab = {
      id: splitId,
      leftInstanceId: leftId,
      rightInstanceId: rightId,
      leftType,
      rightType,
    };

    set((state) => {
      const splitTabs = new Map(state.splitTabs);
      splitTabs.set(splitId, newSplit);
      return {
        splitTabs,
        activeSplitId: splitId,
        selectedInstanceId: null,
        selectedShellId: null,
      };
    });
  },

  removeSplit: (splitId) => {
    set((state) => {
      const splitTabs = new Map(state.splitTabs);
      const removedSplit = splitTabs.get(splitId);
      splitTabs.delete(splitId);

      // Select the left instance/shell when closing split
      let newSelectedInstanceId: string | null = null;
      let newSelectedShellId: string | null = null;

      if (removedSplit) {
        if (removedSplit.leftType === 'instance') {
          newSelectedInstanceId = removedSplit.leftInstanceId;
        } else {
          newSelectedShellId = removedSplit.leftInstanceId;
        }
      }

      return {
        splitTabs,
        activeSplitId: state.activeSplitId === splitId ? null : state.activeSplitId,
        selectedInstanceId: newSelectedInstanceId,
        selectedShellId: newSelectedShellId,
      };
    });
  },

  selectSplit: (splitId) => {
    set({
      activeSplitId: splitId,
      selectedInstanceId: splitId ? null : get().selectedInstanceId,
      selectedShellId: splitId ? null : get().selectedShellId,
    });
  },

  getSplitForInstance: (instanceId) => {
    const state = get();
    for (const split of state.splitTabs.values()) {
      if (split.leftInstanceId === instanceId || split.rightInstanceId === instanceId) {
        return split;
      }
    }
    return undefined;
  },

  getActiveSplit: () => {
    const state = get();
    return state.activeSplitId ? state.splitTabs.get(state.activeSplitId) : undefined;
  },

  // ==================== Permission Prompt Actions ====================

  addPendingPermission: (request) => {
    set((state) => {
      const pendingPermissions = new Map(state.pendingPermissions);
      pendingPermissions.set(request.id, request);
      return { pendingPermissions };
    });
  },

  removePendingPermission: (permissionId) => {
    set((state) => {
      const pendingPermissions = new Map(state.pendingPermissions);
      pendingPermissions.delete(permissionId);
      return { pendingPermissions };
    });
  },

  respondToPermission: async (permissionId, response) => {
    try {
      await window.electronAPI.permissionPrompt.respond(permissionId, response);
      // Remove from pending after successful response
      get().removePendingPermission(permissionId);
    } catch (error) {
      console.error('[instanceStore] Failed to respond to permission:', error);
    }
  },

  getPendingPermissionForInstance: (instanceId) => {
    const state = get();
    for (const permission of state.pendingPermissions.values()) {
      if (permission.instanceId === instanceId) {
        return permission;
      }
    }
    return undefined;
  },
}));
