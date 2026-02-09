import { create } from 'zustand';
import type {
  Conversation,
  ConversationMessage,
  ClaudeModel,
  InstanceMode,
  ConversationStatus,
  ClaudeSessionInfo,
  SessionImportBatchResult,
} from '@shared/types';

// Memoization cache for getConversationsByProject
let _memoConversationsByProject: {
  projectId: string;
  conversationsRef: Conversation[];
  result: Conversation[];
} | null = null;

interface ConversationState {
  conversations: Conversation[];
  isLoading: boolean;
  error: string | null;

  // Session import state
  availableSessions: ClaudeSessionInfo[];
  availableSessionsCount: number;
  isLoadingSessions: boolean;
  isImporting: boolean;

  // Viewer state (read-only mode for structured view)
  viewingConversation: Conversation | null;
  viewingMessages: ConversationMessage[];
  isLoadingViewer: boolean;

  // Actions
  loadConversations: (projectId: string) => Promise<void>;
  createConversation: (data: {
    projectId: string;
    title: string;
    initialPrompt: string;
    model: ClaudeModel;
    mode: InstanceMode;
  }) => Promise<Conversation>;
  updateConversation: (
    id: string,
    updates: Partial<{
      sessionId: string;
      status: ConversationStatus;
      totalCostUsd: number;
      messageCount: number;
      title: string;
    }>
  ) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;

  // Message operations
  addMessage: (data: {
    conversationId: string;
    type: string;
    content: string;
    costUsd?: number;
  }) => Promise<ConversationMessage>;
  getMessages: (conversationId: string) => Promise<ConversationMessage[]>;

  // Session import operations
  checkAvailableSessions: (projectPath: string) => Promise<void>;
  loadAvailableSessions: (projectPath: string) => Promise<void>;
  importSessions: (
    sessionIds: string[],
    projectId: string,
    projectPath: string
  ) => Promise<SessionImportBatchResult>;
  clearAvailableSessions: () => void;

  // Viewer operations (read-only mode)
  openConversationViewer: (conversation: Conversation) => Promise<void>;
  closeConversationViewer: () => void;

  // Selectors
  getConversationsByProject: (projectId: string) => Conversation[];
  getConversationById: (id: string) => Conversation | undefined;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  isLoading: false,
  error: null,

  // Session import state
  availableSessions: [],
  availableSessionsCount: 0,
  isLoadingSessions: false,
  isImporting: false,

  // Viewer state
  viewingConversation: null,
  viewingMessages: [],
  isLoadingViewer: false,

  loadConversations: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const conversations = await window.electronAPI.conversation.getByProject(projectId);
      set({ conversations, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load conversations',
        isLoading: false,
      });
    }
  },

  createConversation: async (data) => {
    try {
      const conversation = await window.electronAPI.conversation.create(data);
      set((state) => ({
        conversations: [conversation, ...state.conversations],
      }));
      return conversation;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create conversation',
      });
      throw error;
    }
  },

  updateConversation: async (id, updates) => {
    try {
      const updated = await window.electronAPI.conversation.update(id, updates);
      if (updated) {
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === id ? updated : c)),
        }));
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update conversation',
      });
    }
  },

  deleteConversation: async (id) => {
    try {
      await window.electronAPI.conversation.delete(id);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete conversation',
      });
    }
  },

  addMessage: async (data) => {
    const message = await window.electronAPI.conversation.addMessage(data);
    return message;
  },

  getMessages: async (conversationId) => {
    return window.electronAPI.conversation.getMessages(conversationId);
  },

  getConversationsByProject: (projectId) => {
    const { conversations } = get();
    if (
      _memoConversationsByProject &&
      _memoConversationsByProject.projectId === projectId &&
      _memoConversationsByProject.conversationsRef === conversations
    ) {
      return _memoConversationsByProject.result;
    }
    const result = conversations.filter((c) => c.projectId === projectId);
    _memoConversationsByProject = { projectId, conversationsRef: conversations, result };
    return result;
  },

  getConversationById: (id) => {
    return get().conversations.find((c) => c.id === id);
  },

  // Session import operations
  checkAvailableSessions: async (projectPath: string) => {
    try {
      const count = await window.electronAPI.session.getCount(projectPath);
      set({ availableSessionsCount: count });
    } catch (error) {
      console.error('Failed to check available sessions:', error);
      set({ availableSessionsCount: 0 });
    }
  },

  loadAvailableSessions: async (projectPath: string) => {
    set({ isLoadingSessions: true });
    try {
      const sessions = await window.electronAPI.session.getAvailable(projectPath);
      set({
        availableSessions: sessions,
        availableSessionsCount: sessions.filter((s) => !s.isImported).length,
        isLoadingSessions: false,
      });
    } catch (error) {
      console.error('Failed to load available sessions:', error);
      set({
        availableSessions: [],
        availableSessionsCount: 0,
        isLoadingSessions: false,
      });
    }
  },

  importSessions: async (sessionIds: string[], projectId: string, projectPath: string) => {
    set({ isImporting: true });
    try {
      const result = await window.electronAPI.session.importBatch(
        sessionIds,
        projectId,
        projectPath
      );

      // Reload conversations to show imported ones
      const conversations = await window.electronAPI.conversation.getByProject(projectId);
      set({ conversations, isImporting: false });

      // Update available sessions count
      const sessions = await window.electronAPI.session.getAvailable(projectPath);
      set({
        availableSessions: sessions,
        availableSessionsCount: sessions.filter((s) => !s.isImported).length,
      });

      return result;
    } catch (error) {
      set({ isImporting: false });
      throw error;
    }
  },

  clearAvailableSessions: () => {
    set({ availableSessions: [], availableSessionsCount: 0 });
  },

  // Viewer operations
  openConversationViewer: async (conversation: Conversation) => {
    set({ isLoadingViewer: true, viewingConversation: conversation });
    try {
      const messages = await window.electronAPI.conversation.getMessages(conversation.id);
      set({ viewingMessages: messages, isLoadingViewer: false });
    } catch (error) {
      console.error('Failed to load conversation messages:', error);
      set({ isLoadingViewer: false, viewingMessages: [] });
    }
  },

  closeConversationViewer: () => {
    set({ viewingConversation: null, viewingMessages: [], isLoadingViewer: false });
  },
}));
