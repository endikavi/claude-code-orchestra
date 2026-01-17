import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDatabase, createMockStatement } from '@/test/mocks/database';

// Mock better-sqlite3 before importing DataStore
const mockStatement = createMockStatement();
const mockDb = createMockDatabase({
  prepare: vi.fn().mockReturnValue(mockStatement),
});

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}));

// Mock the paths module
vi.mock('../utils/paths', () => ({
  getDatabasePath: vi.fn(() => ':memory:'),
}));

// Mock crypto module
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomUUID: vi.fn(() => 'test-uuid-12345'),
    randomBytes: vi.fn(() => ({
      toString: () => 'mockedsecret1234567890abcdef',
    })),
  };
});

// Import DataStore after mocks are set up
import { DataStore } from './DataStore';

describe('DataStore', () => {
  let dataStore: DataStore;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton
    (DataStore as unknown as { instance: null }).instance = null;
  });

  afterEach(() => {
    // Clean up singleton
    try {
      dataStore?.close();
    } catch {
      // ignore
    }
    (DataStore as unknown as { instance: null }).instance = null;
  });

  describe('singleton pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = DataStore.getInstance();
      const instance2 = DataStore.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance after close', () => {
      const instance1 = DataStore.getInstance();
      instance1.close();
      const instance2 = DataStore.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('createProject', () => {
    it('should create a project with generated id and timestamps', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      const project = dataStore.createProject({
        name: 'Test Project',
        path: '/path/to/project',
        description: 'A test project',
      });

      expect(typeof project.id).toBe('string');
      expect(project.id.length).toBeGreaterThan(0);
      expect(project.name).toBe('Test Project');
      expect(project.path).toBe('/path/to/project');
      expect(project.description).toBe('A test project');
      expect(typeof project.createdAt).toBe('number');
      expect(typeof project.updatedAt).toBe('number');
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should handle skipPermissions boolean', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      const project = dataStore.createProject({
        name: 'Test',
        path: '/test',
        skipPermissions: true,
      });

      expect(project.skipPermissions).toBe(true);
    });
  });

  describe('updateProject', () => {
    it('should update a project and set new updatedAt', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      const project = dataStore.updateProject({
        id: 'proj123',
        name: 'Updated Name',
        path: '/updated/path',
        createdAt: 1000,
        updatedAt: 2000,
      });

      expect(project.name).toBe('Updated Name');
      expect(project.updatedAt).toBeGreaterThanOrEqual(Date.now() - 1000);
      expect(mockStatement.run).toHaveBeenCalled();
    });

    it('should throw if project not found', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 0 });

      expect(() =>
        dataStore.updateProject({
          id: 'nonexistent',
          name: 'Test',
          path: '/test',
          createdAt: 1000,
          updatedAt: 2000,
        })
      ).toThrow('Project with id nonexistent not found');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      expect(() => dataStore.deleteProject('proj123')).not.toThrow();
      expect(mockStatement.run).toHaveBeenCalledWith('proj123');
    });

    it('should throw if project not found', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 0 });

      expect(() => dataStore.deleteProject('nonexistent')).toThrow(
        'Project with id nonexistent not found'
      );
    });
  });

  describe('getProjectById', () => {
    it('should return a project when found', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        id: 'proj123',
        name: 'Test',
        path: '/test',
        skipPermissions: 1,
        createdAt: 1000,
        updatedAt: 2000,
      });

      const project = dataStore.getProjectById('proj123');

      expect(project).not.toBeNull();
      expect(project?.id).toBe('proj123');
      expect(project?.skipPermissions).toBe(true);
    });

    it('should return null when not found', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue(undefined);

      const project = dataStore.getProjectById('nonexistent');
      expect(project).toBeNull();
    });
  });

  describe('getProjectByPath', () => {
    it('should return a project when found by path', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        id: 'proj123',
        name: 'Test',
        path: '/test/path',
        skipPermissions: 0,
        createdAt: 1000,
        updatedAt: 2000,
      });

      const project = dataStore.getProjectByPath('/test/path');

      expect(project).not.toBeNull();
      expect(project?.path).toBe('/test/path');
      expect(project?.skipPermissions).toBe(false);
    });
  });

  describe('getAllProjects', () => {
    it('should return all projects', () => {
      dataStore = DataStore.getInstance();
      mockStatement.all.mockReturnValue([
        { id: '1', name: 'P1', path: '/p1', skipPermissions: 0, createdAt: 1000, updatedAt: 2000 },
        { id: '2', name: 'P2', path: '/p2', skipPermissions: 1, createdAt: 1000, updatedAt: 2000 },
      ]);

      const projects = dataStore.getAllProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0].skipPermissions).toBe(false);
      expect(projects[1].skipPermissions).toBe(true);
    });

    it('should return empty array when no projects', () => {
      dataStore = DataStore.getInstance();
      mockStatement.all.mockReturnValue([]);

      const projects = dataStore.getAllProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('createConversation', () => {
    it('should create a conversation with default values', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      const conversation = dataStore.createConversation({
        projectId: 'proj123',
        title: 'Test Conversation',
        initialPrompt: 'Hello',
        model: 'sonnet',
        mode: 'stream-json',
      });

      expect(typeof conversation.id).toBe('string');
      expect(conversation.id.length).toBeGreaterThan(0);
      expect(conversation.status).toBe('active');
      expect(conversation.totalCostUsd).toBe(0);
      expect(conversation.messageCount).toBe(0);
    });
  });

  describe('updateConversation', () => {
    it('should update conversation and return updated object', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        id: 'conv123',
        projectId: 'proj123',
        title: 'Test',
        initialPrompt: 'Hello',
        model: 'sonnet',
        mode: 'stream-json',
        status: 'active',
        totalCostUsd: 0,
        messageCount: 0,
        createdAt: 1000,
        updatedAt: 2000,
      });
      mockStatement.run.mockReturnValue({ changes: 1 });

      const updated = dataStore.updateConversation('conv123', { status: 'completed' });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('completed');
    });

    it('should return null if conversation not found', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue(undefined);

      const updated = dataStore.updateConversation('nonexistent', { status: 'completed' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      expect(() => dataStore.deleteConversation('conv123')).not.toThrow();
    });
  });

  describe('getConversationsByProject', () => {
    it('should return conversations for a project', () => {
      dataStore = DataStore.getInstance();
      mockStatement.all.mockReturnValue([
        {
          id: 'c1',
          projectId: 'proj123',
          title: 'C1',
          initialPrompt: 'Hi',
          model: 'sonnet',
          mode: 'stream-json',
          status: 'active',
          totalCostUsd: 0.01,
          messageCount: 5,
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]);

      const conversations = dataStore.getConversationsByProject('proj123');

      expect(conversations).toHaveLength(1);
      expect(conversations[0].id).toBe('c1');
    });
  });

  describe('addMessage', () => {
    it('should add a message and update conversation stats', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });
      mockStatement.get.mockReturnValue({
        id: 'conv123',
        projectId: 'proj123',
        title: 'Test',
        initialPrompt: 'Hi',
        model: 'sonnet',
        mode: 'stream-json',
        status: 'active',
        totalCostUsd: 0,
        messageCount: 0,
        createdAt: 1000,
        updatedAt: 2000,
      });

      const message = dataStore.addMessage({
        conversationId: 'conv123',
        type: 'assistant',
        content: 'Hello!',
        costUsd: 0.001,
      });

      expect(typeof message.id).toBe('string');
      expect(message.id.length).toBeGreaterThan(0);
      expect(message.type).toBe('assistant');
      expect(message.content).toBe('Hello!');
      expect(message.costUsd).toBe(0.001);
    });
  });

  describe('getMessagesByConversation', () => {
    it('should return messages for a conversation', () => {
      dataStore = DataStore.getInstance();
      mockStatement.all.mockReturnValue([
        {
          id: 'm1',
          conversationId: 'conv123',
          type: 'user',
          content: 'Hello',
          costUsd: null,
          createdAt: 1000,
        },
        {
          id: 'm2',
          conversationId: 'conv123',
          type: 'assistant',
          content: 'Hi!',
          costUsd: 0.001,
          createdAt: 1001,
        },
      ]);

      const messages = dataStore.getMessagesByConversation('conv123');

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('user');
      expect(messages[1].type).toBe('assistant');
    });
  });

  describe('Remote Config', () => {
    it('should get remote config', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 1,
        port: 3847,
        passwordHash: 'hash123',
        autoStart: 0,
      });

      const config = dataStore.getRemoteConfig();

      expect(config.enabled).toBe(true);
      expect(config.port).toBe(3847);
      expect(config.passwordHash).toBe('hash123');
      expect(config.autoStart).toBe(false);
    });

    it('should return defaults when no config exists', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue(undefined);

      const config = dataStore.getRemoteConfig();

      expect(config.enabled).toBe(false);
      expect(config.port).toBe(3847);
    });

    it('should update remote config', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 0,
        port: 3847,
        passwordHash: '',
        autoStart: 0,
      });
      mockStatement.run.mockReturnValue({ changes: 1 });

      const updated = dataStore.updateRemoteConfig({ enabled: true, port: 4000 });

      expect(updated.enabled).toBe(true);
      expect(updated.port).toBe(4000);
    });

    it('should reset remote config', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 1,
        port: 4000,
        passwordHash: 'hash',
        autoStart: 1,
      });
      mockStatement.run.mockReturnValue({ changes: 1 });

      const reset = dataStore.resetRemoteConfig();

      expect(reset.enabled).toBe(false);
      expect(reset.port).toBe(3847);
    });
  });

  describe('Cluster Config', () => {
    it('should get cluster config', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 1,
        role: 'primary',
        nodeId: 'node123',
        nodeName: 'My Node',
        primaryHost: 'localhost',
        primaryPort: 3847,
        sharedSecret: 'secret123',
      });

      const config = dataStore.getClusterConfig();

      expect(config.enabled).toBe(true);
      expect(config.role).toBe('primary');
      expect(config.nodeId).toBe('node123');
    });

    it('should update cluster config', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 0,
        role: 'standalone',
        nodeId: 'node123',
        nodeName: 'My Node',
        primaryHost: '',
        primaryPort: 3847,
        sharedSecret: '',
      });
      mockStatement.run.mockReturnValue({ changes: 1 });

      const updated = dataStore.updateClusterConfig({ role: 'primary', enabled: true });

      expect(updated.role).toBe('primary');
      expect(updated.enabled).toBe(true);
    });

    it('should reset cluster config while preserving nodeId', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 1,
        role: 'primary',
        nodeId: 'original-node-id',
        nodeName: 'Custom Name',
        primaryHost: 'example.com',
        primaryPort: 4000,
        sharedSecret: 'secret',
      });
      mockStatement.run.mockReturnValue({ changes: 1 });

      const reset = dataStore.resetClusterConfig();

      expect(reset.nodeId).toBe('original-node-id');
      expect(reset.enabled).toBe(false);
      expect(reset.role).toBe('standalone');
    });

    it('should generate cluster secret', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({
        enabled: 0,
        role: 'standalone',
        nodeId: 'node123',
        nodeName: 'My Node',
        primaryHost: '',
        primaryPort: 3847,
        sharedSecret: '',
      });
      mockStatement.run.mockReturnValue({ changes: 1 });

      const secret = dataStore.generateClusterSecret();

      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
    });
  });

  describe('App Settings', () => {
    it('should get a setting value', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({ value: 'test-value' });

      const value = dataStore.getSetting('test-key');
      expect(value).toBe('test-value');
    });

    it('should return null for missing setting', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue(undefined);

      const value = dataStore.getSetting('nonexistent');
      expect(value).toBeNull();
    });

    it('should set a setting value', () => {
      dataStore = DataStore.getInstance();
      mockStatement.run.mockReturnValue({ changes: 1 });

      expect(() => dataStore.setSetting('key', 'value')).not.toThrow();
      expect(mockStatement.run).toHaveBeenCalledWith('key', 'value');
    });

    it('should get or create JWT secret', () => {
      dataStore = DataStore.getInstance();
      // First call returns null (no existing secret)
      mockStatement.get.mockReturnValueOnce(undefined);
      mockStatement.run.mockReturnValue({ changes: 1 });

      const secret = dataStore.getOrCreateJwtSecret();

      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
    });

    it('should return existing JWT secret', () => {
      dataStore = DataStore.getInstance();
      mockStatement.get.mockReturnValue({ value: 'existing-secret' });

      const secret = dataStore.getOrCreateJwtSecret();

      expect(secret).toBe('existing-secret');
    });
  });

  describe('close', () => {
    it('should close the database and clear instance', () => {
      dataStore = DataStore.getInstance();
      dataStore.close();

      expect(mockDb.close).toHaveBeenCalled();
      // Getting instance again should create a new one
      const newInstance = DataStore.getInstance();
      expect(newInstance).not.toBe(dataStore);
    });
  });
});
