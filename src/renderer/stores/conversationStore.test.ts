import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConversationStore } from './conversationStore';
import type { Conversation, ConversationMessage, ClaudeSessionInfo } from '@shared/types';

// Mock data
const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'proj-1',
    sessionId: 'sess-1',
    title: 'First Conversation',
    initialPrompt: 'Hello',
    model: 'sonnet',
    mode: 'stream-json',
    status: 'active',
    totalCostUsd: 0.01,
    messageCount: 5,
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
  },
  {
    id: 'conv-2',
    projectId: 'proj-1',
    sessionId: 'sess-2',
    title: 'Second Conversation',
    initialPrompt: 'Hi there',
    model: 'opus',
    mode: 'interactive',
    status: 'completed',
    totalCostUsd: 0.05,
    messageCount: 10,
    createdAt: Date.now() - 2000,
    updatedAt: Date.now() - 500,
  },
];

const mockMessages: ConversationMessage[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    type: 'user',
    content: '{"type":"user","message":"Hello"}',
    createdAt: Date.now() - 1000,
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    type: 'assistant',
    content: '{"type":"assistant","message":"Hi!"}',
    costUsd: 0.001,
    createdAt: Date.now(),
  },
];

const mockSessions: ClaudeSessionInfo[] = [
  {
    sessionId: 'sess-new-1',
    projectPath: '/project/path',
    createdAt: Date.now() - 5000,
    updatedAt: Date.now(),
    messageCount: 3,
    firstUserMessage: 'Help me with something',
    isImported: false,
  },
  {
    sessionId: 'sess-new-2',
    projectPath: '/project/path',
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 1000,
    messageCount: 5,
    isImported: true,
  },
];

describe('conversationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useConversationStore.setState({
      conversations: [],
      isLoading: false,
      error: null,
      availableSessions: [],
      availableSessionsCount: 0,
      isLoadingSessions: false,
      isImporting: false,
      viewingConversation: null,
      viewingMessages: [],
      isLoadingViewer: false,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty conversations array', () => {
      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([]);
    });

    it('should not be loading', () => {
      const state = useConversationStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should have no error', () => {
      const state = useConversationStore.getState();
      expect(state.error).toBeNull();
    });

    it('should have empty available sessions', () => {
      const state = useConversationStore.getState();
      expect(state.availableSessions).toEqual([]);
      expect(state.availableSessionsCount).toBe(0);
    });
  });

  describe('loadConversations', () => {
    it('should load conversations successfully', async () => {
      window.electronAPI.conversation.getByProject = vi.fn().mockResolvedValue(mockConversations);

      await useConversationStore.getState().loadConversations('proj-1');

      const state = useConversationStore.getState();
      expect(state.conversations).toEqual(mockConversations);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set isLoading to true while loading', async () => {
      let resolvePromise: (value: Conversation[]) => void;
      window.electronAPI.conversation.getByProject = vi.fn().mockReturnValue(
        new Promise<Conversation[]>((resolve) => {
          resolvePromise = resolve;
        })
      );

      const loadPromise = useConversationStore.getState().loadConversations('proj-1');

      expect(useConversationStore.getState().isLoading).toBe(true);

      resolvePromise!(mockConversations);
      await loadPromise;

      expect(useConversationStore.getState().isLoading).toBe(false);
    });

    it('should handle errors', async () => {
      window.electronAPI.conversation.getByProject = vi
        .fn()
        .mockRejectedValue(new Error('Load failed'));

      await useConversationStore.getState().loadConversations('proj-1');

      const state = useConversationStore.getState();
      expect(state.error).toBe('Load failed');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('createConversation', () => {
    it('should create a conversation and add it to the list', async () => {
      const newConversation = mockConversations[0];
      window.electronAPI.conversation.create = vi.fn().mockResolvedValue(newConversation);

      const result = await useConversationStore.getState().createConversation({
        projectId: 'proj-1',
        title: 'First Conversation',
        initialPrompt: 'Hello',
        model: 'sonnet',
        mode: 'stream-json',
      });

      expect(result).toEqual(newConversation);
      expect(useConversationStore.getState().conversations).toContainEqual(newConversation);
    });

    it('should add new conversation at the beginning of the list', async () => {
      useConversationStore.setState({ conversations: [mockConversations[1]] });

      const newConversation = mockConversations[0];
      window.electronAPI.conversation.create = vi.fn().mockResolvedValue(newConversation);

      await useConversationStore.getState().createConversation({
        projectId: 'proj-1',
        title: 'First Conversation',
        initialPrompt: 'Hello',
        model: 'sonnet',
        mode: 'stream-json',
      });

      expect(useConversationStore.getState().conversations[0]).toEqual(newConversation);
    });

    it('should handle creation errors', async () => {
      window.electronAPI.conversation.create = vi
        .fn()
        .mockRejectedValue(new Error('Create failed'));

      await expect(
        useConversationStore.getState().createConversation({
          projectId: 'proj-1',
          title: 'Test',
          initialPrompt: 'Hello',
          model: 'sonnet',
          mode: 'stream-json',
        })
      ).rejects.toThrow('Create failed');

      expect(useConversationStore.getState().error).toBe('Create failed');
    });
  });

  describe('updateConversation', () => {
    it('should update an existing conversation', async () => {
      useConversationStore.setState({ conversations: mockConversations });

      const updatedConversation = { ...mockConversations[0], status: 'completed' as const };
      window.electronAPI.conversation.update = vi.fn().mockResolvedValue(updatedConversation);

      await useConversationStore.getState().updateConversation('conv-1', { status: 'completed' });

      const state = useConversationStore.getState();
      const conversation = state.conversations.find((c) => c.id === 'conv-1');
      expect(conversation?.status).toBe('completed');
    });

    it('should not update if API returns null', async () => {
      useConversationStore.setState({ conversations: mockConversations });
      window.electronAPI.conversation.update = vi.fn().mockResolvedValue(null);

      await useConversationStore.getState().updateConversation('conv-1', { status: 'completed' });

      // Should not throw, conversation should remain unchanged
      const conversation = useConversationStore
        .getState()
        .conversations.find((c) => c.id === 'conv-1');
      expect(conversation?.status).toBe('active');
    });

    it('should handle update errors', async () => {
      useConversationStore.setState({ conversations: mockConversations });
      window.electronAPI.conversation.update = vi
        .fn()
        .mockRejectedValue(new Error('Update failed'));

      await useConversationStore.getState().updateConversation('conv-1', { status: 'completed' });

      expect(useConversationStore.getState().error).toBe('Update failed');
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation from the list', async () => {
      useConversationStore.setState({ conversations: mockConversations });
      window.electronAPI.conversation.delete = vi.fn().mockResolvedValue(undefined);

      await useConversationStore.getState().deleteConversation('conv-1');

      const state = useConversationStore.getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations.find((c) => c.id === 'conv-1')).toBeUndefined();
    });

    it('should handle deletion errors', async () => {
      useConversationStore.setState({ conversations: mockConversations });
      window.electronAPI.conversation.delete = vi
        .fn()
        .mockRejectedValue(new Error('Delete failed'));

      await useConversationStore.getState().deleteConversation('conv-1');

      expect(useConversationStore.getState().error).toBe('Delete failed');
      expect(useConversationStore.getState().conversations).toHaveLength(2); // Not deleted
    });
  });

  describe('message operations', () => {
    it('addMessage should add a message', async () => {
      const newMessage = mockMessages[0];
      window.electronAPI.conversation.addMessage = vi.fn().mockResolvedValue(newMessage);

      const result = await useConversationStore.getState().addMessage({
        conversationId: 'conv-1',
        type: 'user',
        content: '{"type":"user","message":"Hello"}',
      });

      expect(result).toEqual(newMessage);
    });

    it('getMessages should return messages for conversation', async () => {
      window.electronAPI.conversation.getMessages = vi.fn().mockResolvedValue(mockMessages);

      const result = await useConversationStore.getState().getMessages('conv-1');

      expect(result).toEqual(mockMessages);
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      useConversationStore.setState({ conversations: mockConversations });
    });

    it('getConversationsByProject should filter by project', () => {
      const conversations = useConversationStore.getState().getConversationsByProject('proj-1');
      expect(conversations).toHaveLength(2);
    });

    it('getConversationsByProject should return empty for unknown project', () => {
      const conversations = useConversationStore.getState().getConversationsByProject('unknown');
      expect(conversations).toHaveLength(0);
    });

    it('getConversationById should return conversation', () => {
      const conversation = useConversationStore.getState().getConversationById('conv-1');
      expect(conversation?.id).toBe('conv-1');
    });

    it('getConversationById should return undefined for unknown id', () => {
      const conversation = useConversationStore.getState().getConversationById('unknown');
      expect(conversation).toBeUndefined();
    });
  });

  describe('session import operations', () => {
    it('checkAvailableSessions should update count', async () => {
      window.electronAPI.session.getCount = vi.fn().mockResolvedValue(5);

      await useConversationStore.getState().checkAvailableSessions('/project/path');

      expect(useConversationStore.getState().availableSessionsCount).toBe(5);
    });

    it('checkAvailableSessions should set count to 0 on error', async () => {
      window.electronAPI.session.getCount = vi.fn().mockRejectedValue(new Error('Failed'));

      await useConversationStore.getState().checkAvailableSessions('/project/path');

      expect(useConversationStore.getState().availableSessionsCount).toBe(0);
    });

    it('loadAvailableSessions should load sessions', async () => {
      window.electronAPI.session.getAvailable = vi.fn().mockResolvedValue(mockSessions);

      await useConversationStore.getState().loadAvailableSessions('/project/path');

      const state = useConversationStore.getState();
      expect(state.availableSessions).toEqual(mockSessions);
      expect(state.availableSessionsCount).toBe(1); // Only 1 not imported
      expect(state.isLoadingSessions).toBe(false);
    });

    it('loadAvailableSessions should handle errors', async () => {
      window.electronAPI.session.getAvailable = vi.fn().mockRejectedValue(new Error('Failed'));

      await useConversationStore.getState().loadAvailableSessions('/project/path');

      const state = useConversationStore.getState();
      expect(state.availableSessions).toEqual([]);
      expect(state.availableSessionsCount).toBe(0);
      expect(state.isLoadingSessions).toBe(false);
    });

    it('importSessions should import sessions and reload conversations', async () => {
      const importResult = { imported: 2, failed: 0, errors: [] };
      window.electronAPI.session.importBatch = vi.fn().mockResolvedValue(importResult);
      window.electronAPI.conversation.getByProject = vi.fn().mockResolvedValue(mockConversations);
      window.electronAPI.session.getAvailable = vi.fn().mockResolvedValue(mockSessions);

      const result = await useConversationStore
        .getState()
        .importSessions(['sess-1', 'sess-2'], 'proj-1', '/project/path');

      expect(result).toEqual(importResult);
      expect(useConversationStore.getState().conversations).toEqual(mockConversations);
      expect(useConversationStore.getState().isImporting).toBe(false);
    });

    it('importSessions should set isImporting to false on error', async () => {
      window.electronAPI.session.importBatch = vi
        .fn()
        .mockRejectedValue(new Error('Import failed'));

      await expect(
        useConversationStore.getState().importSessions(['sess-1'], 'proj-1', '/project/path')
      ).rejects.toThrow('Import failed');

      expect(useConversationStore.getState().isImporting).toBe(false);
    });

    it('clearAvailableSessions should reset session data', () => {
      useConversationStore.setState({
        availableSessions: mockSessions,
        availableSessionsCount: 5,
      });

      useConversationStore.getState().clearAvailableSessions();

      expect(useConversationStore.getState().availableSessions).toEqual([]);
      expect(useConversationStore.getState().availableSessionsCount).toBe(0);
    });
  });

  describe('viewer operations', () => {
    it('openConversationViewer should load conversation and messages', async () => {
      window.electronAPI.conversation.getMessages = vi.fn().mockResolvedValue(mockMessages);

      await useConversationStore.getState().openConversationViewer(mockConversations[0]);

      const state = useConversationStore.getState();
      expect(state.viewingConversation).toEqual(mockConversations[0]);
      expect(state.viewingMessages).toEqual(mockMessages);
      expect(state.isLoadingViewer).toBe(false);
    });

    it('openConversationViewer should handle errors', async () => {
      window.electronAPI.conversation.getMessages = vi.fn().mockRejectedValue(new Error('Failed'));

      await useConversationStore.getState().openConversationViewer(mockConversations[0]);

      const state = useConversationStore.getState();
      expect(state.viewingConversation).toEqual(mockConversations[0]);
      expect(state.viewingMessages).toEqual([]);
      expect(state.isLoadingViewer).toBe(false);
    });

    it('closeConversationViewer should reset viewer state', () => {
      useConversationStore.setState({
        viewingConversation: mockConversations[0],
        viewingMessages: mockMessages,
        isLoadingViewer: false,
      });

      useConversationStore.getState().closeConversationViewer();

      const state = useConversationStore.getState();
      expect(state.viewingConversation).toBeNull();
      expect(state.viewingMessages).toEqual([]);
      expect(state.isLoadingViewer).toBe(false);
    });
  });
});
