import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInstanceStore } from './instanceStore';
import type { ClaudeInstance, Conversation, StreamMessage } from '@shared/types';

// Mock conversationStore
vi.mock('./conversationStore', () => ({
  useConversationStore: {
    getState: vi.fn(() => ({
      updateConversation: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock data
const mockInstance: ClaudeInstance = {
  id: 'inst-1',
  projectId: 'proj-1',
  model: 'sonnet',
  mode: 'stream-json',
  status: 'running',
  createdAt: Date.now(),
};

const mockConversation: Conversation = {
  id: 'conv-1',
  projectId: 'proj-1',
  sessionId: 'sess-1',
  title: 'Test Conversation',
  initialPrompt: 'Hello',
  model: 'sonnet',
  mode: 'stream-json',
  status: 'active',
  totalCostUsd: 0,
  messageCount: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockStreamMessage: StreamMessage = {
  type: 'assistant',
  message: {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello!' }],
    model: 'claude-sonnet',
  },
};

describe('instanceStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useInstanceStore.setState({
      instances: [],
      outputs: new Map(),
      instanceConversations: new Map(),
      activities: new Map(),
      selectedInstanceId: null,
      lastSelectionTime: 0,
      isLoading: false,
      error: null,
      removingInstanceIds: new Set(), // Reset removing instances tracking
      // Shell state
      shellInstances: [],
      shellOutputs: new Map(),
      selectedShellId: null,
      // Split tab state
      splitTabs: new Map(),
      activeSplitId: null,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty instances array', () => {
      const state = useInstanceStore.getState();
      expect(state.instances).toEqual([]);
    });

    it('should have empty outputs map', () => {
      const state = useInstanceStore.getState();
      expect(state.outputs.size).toBe(0);
    });

    it('should have no selected instance', () => {
      const state = useInstanceStore.getState();
      expect(state.selectedInstanceId).toBeNull();
    });

    it('should not be loading', () => {
      const state = useInstanceStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should have no error', () => {
      const state = useInstanceStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('createInstance', () => {
    it('should create an instance and add it to the list', async () => {
      window.electronAPI.instance.create = vi.fn().mockResolvedValue(mockInstance);

      const result = await useInstanceStore.getState().createInstance({
        projectId: 'proj-1',
        model: 'sonnet',
        mode: 'stream-json',
      });

      expect(result).toEqual(mockInstance);
      expect(useInstanceStore.getState().instances).toContainEqual(mockInstance);
    });

    it('should initialize output storage for new instance', async () => {
      window.electronAPI.instance.create = vi.fn().mockResolvedValue(mockInstance);

      await useInstanceStore.getState().createInstance({
        projectId: 'proj-1',
        model: 'sonnet',
        mode: 'stream-json',
      });

      const output = useInstanceStore.getState().outputs.get(mockInstance.id);
      expect(output).toBeDefined();
      expect(output?.messages).toEqual([]);
      expect(output?.rawOutput).toBe('');
    });

    it('should select the new instance', async () => {
      window.electronAPI.instance.create = vi.fn().mockResolvedValue(mockInstance);

      await useInstanceStore.getState().createInstance({
        projectId: 'proj-1',
        model: 'sonnet',
        mode: 'stream-json',
      });

      expect(useInstanceStore.getState().selectedInstanceId).toBe(mockInstance.id);
    });

    it('should set isLoading during creation', async () => {
      let resolvePromise: (value: ClaudeInstance) => void;
      window.electronAPI.instance.create = vi.fn().mockReturnValue(
        new Promise<ClaudeInstance>((resolve) => {
          resolvePromise = resolve;
        })
      );

      const createPromise = useInstanceStore.getState().createInstance({
        projectId: 'proj-1',
        model: 'sonnet',
        mode: 'stream-json',
      });

      expect(useInstanceStore.getState().isLoading).toBe(true);

      resolvePromise!(mockInstance);
      await createPromise;

      expect(useInstanceStore.getState().isLoading).toBe(false);
    });

    it('should handle creation errors', async () => {
      window.electronAPI.instance.create = vi.fn().mockRejectedValue(new Error('Create failed'));

      await expect(
        useInstanceStore.getState().createInstance({
          projectId: 'proj-1',
          model: 'sonnet',
          mode: 'stream-json',
        })
      ).rejects.toThrow('Create failed');

      expect(useInstanceStore.getState().error).toBe('Create failed');
      expect(useInstanceStore.getState().isLoading).toBe(false);
    });
  });

  describe('resumeConversation', () => {
    it('should throw if conversation has no sessionId', async () => {
      const conversationWithoutSession = { ...mockConversation, sessionId: undefined };

      await expect(
        useInstanceStore.getState().resumeConversation(conversationWithoutSession)
      ).rejects.toThrow('Cannot resume conversation without sessionId');
    });

    it('should resume conversation and load previous messages', async () => {
      const previousMessages = [
        { id: 'm1', conversationId: 'conv-1', type: 'user', content: '{}', createdAt: 1000 },
      ];
      window.electronAPI.conversation.getMessages = vi.fn().mockResolvedValue(previousMessages);
      window.electronAPI.instance.resume = vi.fn().mockResolvedValue(mockInstance);

      const result = await useInstanceStore.getState().resumeConversation(mockConversation);

      expect(result).toEqual(mockInstance);
      expect(window.electronAPI.instance.resume).toHaveBeenCalledWith({
        projectId: mockConversation.projectId,
        sessionId: mockConversation.sessionId,
        model: mockConversation.model,
        mode: mockConversation.mode,
      });
    });

    it('should map instance to conversation', async () => {
      window.electronAPI.conversation.getMessages = vi.fn().mockResolvedValue([]);
      window.electronAPI.instance.resume = vi.fn().mockResolvedValue(mockInstance);

      await useInstanceStore.getState().resumeConversation(mockConversation);

      const conversationId = useInstanceStore
        .getState()
        .getConversationIdForInstance(mockInstance.id);
      expect(conversationId).toBe(mockConversation.id);
    });
  });

  describe('killInstance', () => {
    it('should kill instance and remove from store', () => {
      useInstanceStore.setState({
        instances: [mockInstance],
        outputs: new Map([
          [mockInstance.id, { instanceId: mockInstance.id, messages: [], rawOutput: '' }],
        ]),
        selectedInstanceId: mockInstance.id,
      });

      window.electronAPI.instance.kill = vi.fn().mockResolvedValue(undefined);

      useInstanceStore.getState().killInstance(mockInstance.id);

      expect(window.electronAPI.instance.kill).toHaveBeenCalledWith(mockInstance.id);
      expect(useInstanceStore.getState().instances).toHaveLength(0);
    });

    it('should handle kill errors gracefully (fire-and-forget)', async () => {
      useInstanceStore.setState({ instances: [mockInstance] });
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.electronAPI.instance.kill = vi.fn().mockRejectedValue(new Error('Kill failed'));

      useInstanceStore.getState().killInstance(mockInstance.id);

      // Instance should still be removed from UI immediately
      expect(useInstanceStore.getState().instances).toHaveLength(0);

      // Wait for the promise rejection to be handled
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Error is logged but not set to state (fire-and-forget pattern)
      expect(consoleWarn).toHaveBeenCalled();
      expect(useInstanceStore.getState().error).toBeNull();

      consoleWarn.mockRestore();
    });
  });

  describe('removeInstance', () => {
    it('should remove instance from list', () => {
      useInstanceStore.setState({
        instances: [mockInstance],
        outputs: new Map([
          [mockInstance.id, { instanceId: mockInstance.id, messages: [], rawOutput: '' }],
        ]),
        instanceConversations: new Map([[mockInstance.id, 'conv-1']]),
      });

      useInstanceStore.getState().removeInstance(mockInstance.id);

      expect(useInstanceStore.getState().instances).toHaveLength(0);
      expect(useInstanceStore.getState().outputs.has(mockInstance.id)).toBe(false);
      expect(useInstanceStore.getState().instanceConversations.has(mockInstance.id)).toBe(false);
    });

    it('should select another instance if removed instance was selected', () => {
      const instance2: ClaudeInstance = { ...mockInstance, id: 'inst-2' };
      useInstanceStore.setState({
        instances: [mockInstance, instance2],
        selectedInstanceId: mockInstance.id,
      });

      useInstanceStore.getState().removeInstance(mockInstance.id);

      expect(useInstanceStore.getState().selectedInstanceId).toBe(instance2.id);
    });

    it('should set selectedInstanceId to null if no instances remain', () => {
      useInstanceStore.setState({
        instances: [mockInstance],
        selectedInstanceId: mockInstance.id,
      });

      useInstanceStore.getState().removeInstance(mockInstance.id);

      expect(useInstanceStore.getState().selectedInstanceId).toBeNull();
    });
  });

  describe('sendInput', () => {
    it('should send input to instance', async () => {
      window.electronAPI.instance.sendInput = vi.fn().mockResolvedValue(undefined);

      await useInstanceStore.getState().sendInput('inst-1', 'Hello Claude');

      expect(window.electronAPI.instance.sendInput).toHaveBeenCalledWith('inst-1', 'Hello Claude');
    });

    it('should handle send errors', async () => {
      window.electronAPI.instance.sendInput = vi.fn().mockRejectedValue(new Error('Send failed'));

      await useInstanceStore.getState().sendInput('inst-1', 'Hello');

      expect(useInstanceStore.getState().error).toBe('Send failed');
    });
  });

  describe('selectInstance', () => {
    it('should select an instance', () => {
      useInstanceStore.setState({ instances: [mockInstance] });

      useInstanceStore.getState().selectInstance(mockInstance.id);

      expect(useInstanceStore.getState().selectedInstanceId).toBe(mockInstance.id);
    });

    it('should clear selection when null is passed', () => {
      useInstanceStore.setState({ selectedInstanceId: mockInstance.id });

      useInstanceStore.getState().selectInstance(null);

      expect(useInstanceStore.getState().selectedInstanceId).toBeNull();
    });
  });

  describe('loadInstances', () => {
    it('should load instances from API', async () => {
      window.electronAPI.instance.getAll = vi.fn().mockResolvedValue([mockInstance]);

      await useInstanceStore.getState().loadInstances();

      expect(useInstanceStore.getState().instances).toEqual([mockInstance]);
    });

    it('should handle load errors', async () => {
      window.electronAPI.instance.getAll = vi.fn().mockRejectedValue(new Error('Load failed'));

      await useInstanceStore.getState().loadInstances();

      expect(useInstanceStore.getState().error).toBe('Load failed');
    });
  });

  describe('syncInstances', () => {
    it('should sync instances from server', () => {
      const instances = [mockInstance];
      const outputs = {
        [mockInstance.id]: {
          messages: [mockStreamMessage],
          rawOutput: 'raw output data',
        },
      };

      useInstanceStore.getState().syncInstances(instances, outputs);

      expect(useInstanceStore.getState().instances).toEqual(instances);
      const output = useInstanceStore.getState().outputs.get(mockInstance.id);
      expect(output?.messages).toEqual([mockStreamMessage]);
      expect(output?.rawOutput).toBe('raw output data');
    });

    it('should initialize output storage for instances without outputs', () => {
      useInstanceStore.getState().syncInstances([mockInstance]);

      const output = useInstanceStore.getState().outputs.get(mockInstance.id);
      expect(output).toBeDefined();
      expect(output?.messages).toEqual([]);
    });
  });

  describe('updateInstanceStatus', () => {
    it('should update instance status', () => {
      useInstanceStore.setState({ instances: [mockInstance] });

      useInstanceStore.getState().updateInstanceStatus(mockInstance.id, 'completed');

      const instance = useInstanceStore.getState().instances.find((i) => i.id === mockInstance.id);
      expect(instance?.status).toBe('completed');
    });
  });

  describe('updateTerminalTitle', () => {
    it('should update terminal title', () => {
      useInstanceStore.setState({ instances: [mockInstance] });

      useInstanceStore.getState().updateTerminalTitle(mockInstance.id, 'New Title');

      const instance = useInstanceStore.getState().instances.find((i) => i.id === mockInstance.id);
      expect(instance?.terminalTitle).toBe('New Title');
    });
  });

  describe('addInstanceOutput', () => {
    it('should add message to instance output', () => {
      useInstanceStore.setState({
        outputs: new Map([
          [mockInstance.id, { instanceId: mockInstance.id, messages: [], rawOutput: '' }],
        ]),
      });

      useInstanceStore.getState().addInstanceOutput(mockInstance.id, mockStreamMessage);

      const output = useInstanceStore.getState().outputs.get(mockInstance.id);
      expect(output?.messages).toContainEqual(mockStreamMessage);
    });

    it('should create output storage if not exists', () => {
      useInstanceStore.getState().addInstanceOutput(mockInstance.id, mockStreamMessage);

      const output = useInstanceStore.getState().outputs.get(mockInstance.id);
      expect(output).toBeDefined();
      expect(output?.messages).toContainEqual(mockStreamMessage);
    });
  });

  describe('addRawOutput', () => {
    it('should append raw output data', () => {
      useInstanceStore.setState({
        outputs: new Map([
          [mockInstance.id, { instanceId: mockInstance.id, messages: [], rawOutput: 'Hello' }],
        ]),
      });

      useInstanceStore.getState().addRawOutput(mockInstance.id, ' World');

      const output = useInstanceStore.getState().outputs.get(mockInstance.id);
      expect(output?.rawOutput).toBe('Hello World');
    });
  });

  describe('setInstanceError', () => {
    it('should set error on instance', () => {
      useInstanceStore.setState({ instances: [mockInstance] });

      useInstanceStore.getState().setInstanceError(mockInstance.id, 'Test error');

      const instance = useInstanceStore.getState().instances.find((i) => i.id === mockInstance.id);
      expect(instance?.status).toBe('error');
      expect(instance?.error).toBe('Test error');
    });
  });

  describe('handleInstanceExit', () => {
    it('should set status to completed on exit code 0', () => {
      useInstanceStore.setState({ instances: [mockInstance] });

      useInstanceStore.getState().handleInstanceExit(mockInstance.id, 0);

      const instance = useInstanceStore.getState().instances.find((i) => i.id === mockInstance.id);
      expect(instance?.status).toBe('completed');
    });

    it('should set status to error on non-zero exit code', () => {
      useInstanceStore.setState({ instances: [mockInstance] });

      useInstanceStore.getState().handleInstanceExit(mockInstance.id, 1);

      const instance = useInstanceStore.getState().instances.find((i) => i.id === mockInstance.id);
      expect(instance?.status).toBe('error');
    });

    it('should not change status if instance was killed', () => {
      const killedInstance = { ...mockInstance, status: 'killed' as const };
      useInstanceStore.setState({ instances: [killedInstance] });

      useInstanceStore.getState().handleInstanceExit(mockInstance.id, 0);

      const instance = useInstanceStore.getState().instances.find((i) => i.id === mockInstance.id);
      expect(instance?.status).toBe('killed');
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      const instance2: ClaudeInstance = { ...mockInstance, id: 'inst-2', projectId: 'proj-2' };
      useInstanceStore.setState({
        instances: [mockInstance, instance2],
        outputs: new Map([
          [mockInstance.id, { instanceId: mockInstance.id, messages: [], rawOutput: '' }],
        ]),
        instanceConversations: new Map([[mockInstance.id, 'conv-1']]),
        selectedInstanceId: mockInstance.id,
      });
    });

    it('getInstancesByProject should filter by project', () => {
      const instances = useInstanceStore.getState().getInstancesByProject('proj-1');
      expect(instances).toHaveLength(1);
      expect(instances[0].projectId).toBe('proj-1');
    });

    it('getSelectedInstance should return selected instance', () => {
      const instance = useInstanceStore.getState().getSelectedInstance();
      expect(instance?.id).toBe(mockInstance.id);
    });

    it('getInstanceOutput should return output for instance', () => {
      const output = useInstanceStore.getState().getInstanceOutput(mockInstance.id);
      expect(output?.instanceId).toBe(mockInstance.id);
    });

    it('getConversationIdForInstance should return conversation id', () => {
      const convId = useInstanceStore.getState().getConversationIdForInstance(mockInstance.id);
      expect(convId).toBe('conv-1');
    });

    it('getInstanceForConversation should return instance by conversation', () => {
      const instance = useInstanceStore.getState().getInstanceForConversation('conv-1');
      expect(instance?.id).toBe(mockInstance.id);
    });

    it('getInstanceOutputForConversation should return output by conversation', () => {
      const output = useInstanceStore.getState().getInstanceOutputForConversation('conv-1');
      expect(output?.instanceId).toBe(mockInstance.id);
    });

    it('getInstanceForConversation should return undefined for unknown conversation', () => {
      const instance = useInstanceStore.getState().getInstanceForConversation('unknown-conv');
      expect(instance).toBeUndefined();
    });

    it('getInstanceOutputForConversation should return undefined for unknown conversation', () => {
      const output = useInstanceStore.getState().getInstanceOutputForConversation('unknown-conv');
      expect(output).toBeUndefined();
    });
  });

  // ==================== Shell Tests ====================
  describe('shell initial state', () => {
    it('should have empty shell instances array', () => {
      const state = useInstanceStore.getState();
      expect(state.shellInstances).toEqual([]);
    });

    it('should have empty shell outputs map', () => {
      const state = useInstanceStore.getState();
      expect(state.shellOutputs.size).toBe(0);
    });

    it('should have no selected shell', () => {
      const state = useInstanceStore.getState();
      expect(state.selectedShellId).toBeNull();
    });
  });

  describe('createShellInstance', () => {
    const mockShell = {
      id: 'shell-1',
      projectId: 'proj-1',
      status: 'running' as const,
      createdAt: Date.now(),
    };

    it('should create a shell and add it to the list', async () => {
      window.electronAPI.shell.create = vi.fn().mockResolvedValue(mockShell);

      const result = await useInstanceStore.getState().createShellInstance('proj-1');

      expect(result).toEqual(mockShell);
      expect(useInstanceStore.getState().shellInstances).toContainEqual(mockShell);
    });

    it('should initialize shell output storage', async () => {
      window.electronAPI.shell.create = vi.fn().mockResolvedValue(mockShell);

      await useInstanceStore.getState().createShellInstance('proj-1');

      const output = useInstanceStore.getState().shellOutputs.get(mockShell.id);
      expect(output).toBeDefined();
      expect(output?.rawOutput).toBe('');
    });

    it('should select the new shell and deselect instance', async () => {
      useInstanceStore.setState({ selectedInstanceId: 'inst-1' });
      window.electronAPI.shell.create = vi.fn().mockResolvedValue(mockShell);

      await useInstanceStore.getState().createShellInstance('proj-1');

      expect(useInstanceStore.getState().selectedShellId).toBe(mockShell.id);
      expect(useInstanceStore.getState().selectedInstanceId).toBeNull();
    });

    it('should handle creation errors', async () => {
      window.electronAPI.shell.create = vi.fn().mockRejectedValue(new Error('Shell create failed'));

      await expect(useInstanceStore.getState().createShellInstance('proj-1')).rejects.toThrow(
        'Shell create failed'
      );

      expect(useInstanceStore.getState().error).toBe('Shell create failed');
    });
  });

  describe('killShellInstance', () => {
    const mockShell = {
      id: 'shell-1',
      projectId: 'proj-1',
      status: 'running' as const,
      createdAt: Date.now(),
    };

    it('should kill shell and remove from store', async () => {
      useInstanceStore.setState({
        shellInstances: [mockShell],
        shellOutputs: new Map([[mockShell.id, { shellId: mockShell.id, rawOutput: '' }]]),
        selectedShellId: mockShell.id,
      });

      window.electronAPI.shell.kill = vi.fn().mockResolvedValue(undefined);

      await useInstanceStore.getState().killShellInstance(mockShell.id);

      expect(window.electronAPI.shell.kill).toHaveBeenCalledWith(mockShell.id);
      expect(useInstanceStore.getState().shellInstances).toHaveLength(0);
    });

    it('should handle kill errors', async () => {
      useInstanceStore.setState({ shellInstances: [mockShell] });
      window.electronAPI.shell.kill = vi.fn().mockRejectedValue(new Error('Kill shell failed'));

      await useInstanceStore.getState().killShellInstance(mockShell.id);

      expect(useInstanceStore.getState().error).toBe('Kill shell failed');
    });
  });

  describe('removeShellInstance', () => {
    const mockShell = {
      id: 'shell-1',
      projectId: 'proj-1',
      status: 'running' as const,
      createdAt: Date.now(),
    };

    it('should remove shell from list', () => {
      useInstanceStore.setState({
        shellInstances: [mockShell],
        shellOutputs: new Map([[mockShell.id, { shellId: mockShell.id, rawOutput: '' }]]),
      });

      useInstanceStore.getState().removeShellInstance(mockShell.id);

      expect(useInstanceStore.getState().shellInstances).toHaveLength(0);
      expect(useInstanceStore.getState().shellOutputs.has(mockShell.id)).toBe(false);
    });

    it('should select another shell if removed shell was selected', () => {
      const shell2 = { ...mockShell, id: 'shell-2' };
      useInstanceStore.setState({
        shellInstances: [mockShell, shell2],
        selectedShellId: mockShell.id,
      });

      useInstanceStore.getState().removeShellInstance(mockShell.id);

      expect(useInstanceStore.getState().selectedShellId).toBe(shell2.id);
    });

    it('should set selectedShellId to null if no shells remain', () => {
      useInstanceStore.setState({
        shellInstances: [mockShell],
        selectedShellId: mockShell.id,
      });

      useInstanceStore.getState().removeShellInstance(mockShell.id);

      expect(useInstanceStore.getState().selectedShellId).toBeNull();
    });
  });

  describe('sendShellInput', () => {
    it('should send input to shell', async () => {
      window.electronAPI.shell.sendInput = vi.fn().mockResolvedValue(undefined);

      await useInstanceStore.getState().sendShellInput('shell-1', 'ls -la');

      expect(window.electronAPI.shell.sendInput).toHaveBeenCalledWith('shell-1', 'ls -la');
    });

    it('should handle send errors', async () => {
      window.electronAPI.shell.sendInput = vi.fn().mockRejectedValue(new Error('Send failed'));

      await useInstanceStore.getState().sendShellInput('shell-1', 'ls');

      expect(useInstanceStore.getState().error).toBe('Send failed');
    });
  });

  describe('selectShell', () => {
    it('should select a shell and deselect instance', () => {
      useInstanceStore.setState({ selectedInstanceId: 'inst-1' });

      useInstanceStore.getState().selectShell('shell-1');

      expect(useInstanceStore.getState().selectedShellId).toBe('shell-1');
      expect(useInstanceStore.getState().selectedInstanceId).toBeNull();
    });

    it('should clear selection when null is passed', () => {
      useInstanceStore.setState({ selectedShellId: 'shell-1', selectedInstanceId: 'inst-1' });

      useInstanceStore.getState().selectShell(null);

      expect(useInstanceStore.getState().selectedShellId).toBeNull();
      expect(useInstanceStore.getState().selectedInstanceId).toBe('inst-1');
    });
  });

  describe('updateShellStatus', () => {
    it('should update shell status', () => {
      const mockShell = {
        id: 'shell-1',
        projectId: 'proj-1',
        status: 'running' as const,
        createdAt: Date.now(),
      };
      useInstanceStore.setState({ shellInstances: [mockShell] });

      useInstanceStore.getState().updateShellStatus('shell-1', 'completed');

      const shell = useInstanceStore.getState().shellInstances.find((s) => s.id === 'shell-1');
      expect(shell?.status).toBe('completed');
    });
  });

  describe('addShellRawOutput', () => {
    it('should append raw output data', () => {
      useInstanceStore.setState({
        shellOutputs: new Map([['shell-1', { shellId: 'shell-1', rawOutput: 'Hello' }]]),
      });

      useInstanceStore.getState().addShellRawOutput('shell-1', ' World');

      const output = useInstanceStore.getState().shellOutputs.get('shell-1');
      expect(output?.rawOutput).toBe('Hello World');
    });

    it('should create output storage if not exists', () => {
      useInstanceStore.getState().addShellRawOutput('shell-1', 'New data');

      const output = useInstanceStore.getState().shellOutputs.get('shell-1');
      expect(output?.rawOutput).toBe('New data');
    });
  });

  describe('handleShellExit', () => {
    const mockShell = {
      id: 'shell-1',
      projectId: 'proj-1',
      status: 'running' as const,
      createdAt: Date.now(),
    };

    it('should set status to completed on exit code 0', () => {
      useInstanceStore.setState({ shellInstances: [mockShell] });

      useInstanceStore.getState().handleShellExit('shell-1', 0);

      const shell = useInstanceStore.getState().shellInstances.find((s) => s.id === 'shell-1');
      expect(shell?.status).toBe('completed');
    });

    it('should set status to error on non-zero exit code', () => {
      useInstanceStore.setState({ shellInstances: [mockShell] });

      useInstanceStore.getState().handleShellExit('shell-1', 1);

      const shell = useInstanceStore.getState().shellInstances.find((s) => s.id === 'shell-1');
      expect(shell?.status).toBe('error');
    });

    it('should not change status if shell was killed', () => {
      const killedShell = { ...mockShell, status: 'killed' as const };
      useInstanceStore.setState({ shellInstances: [killedShell] });

      useInstanceStore.getState().handleShellExit('shell-1', 0);

      const shell = useInstanceStore.getState().shellInstances.find((s) => s.id === 'shell-1');
      expect(shell?.status).toBe('killed');
    });
  });

  describe('shell selectors', () => {
    const mockShell = {
      id: 'shell-1',
      projectId: 'proj-1',
      status: 'running' as const,
      createdAt: Date.now(),
    };

    beforeEach(() => {
      const shell2 = { ...mockShell, id: 'shell-2', projectId: 'proj-2' };
      useInstanceStore.setState({
        shellInstances: [mockShell, shell2],
        shellOutputs: new Map([[mockShell.id, { shellId: mockShell.id, rawOutput: 'output' }]]),
        selectedShellId: mockShell.id,
      });
    });

    it('getShellsByProject should filter by project', () => {
      const shells = useInstanceStore.getState().getShellsByProject('proj-1');
      expect(shells).toHaveLength(1);
      expect(shells[0].projectId).toBe('proj-1');
    });

    it('getSelectedShell should return selected shell', () => {
      const shell = useInstanceStore.getState().getSelectedShell();
      expect(shell?.id).toBe(mockShell.id);
    });

    it('getShellOutput should return output for shell', () => {
      const output = useInstanceStore.getState().getShellOutput(mockShell.id);
      expect(output?.shellId).toBe(mockShell.id);
      expect(output?.rawOutput).toBe('output');
    });
  });
});
