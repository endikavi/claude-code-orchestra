import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS, type IpcChannel } from './channels';

describe('IPC_CHANNELS', () => {
  describe('Project channels', () => {
    it('should have correct project operation channels', () => {
      expect(IPC_CHANNELS.PROJECT_CREATE).toBe('project:create');
      expect(IPC_CHANNELS.PROJECT_UPDATE).toBe('project:update');
      expect(IPC_CHANNELS.PROJECT_DELETE).toBe('project:delete');
      expect(IPC_CHANNELS.PROJECT_GET_ALL).toBe('project:getAll');
      expect(IPC_CHANNELS.PROJECT_GET_BY_ID).toBe('project:getById');
    });
  });

  describe('Instance channels', () => {
    it('should have correct instance operation channels', () => {
      expect(IPC_CHANNELS.INSTANCE_CREATE).toBe('instance:create');
      expect(IPC_CHANNELS.INSTANCE_KILL).toBe('instance:kill');
      expect(IPC_CHANNELS.INSTANCE_SEND_INPUT).toBe('instance:sendInput');
      expect(IPC_CHANNELS.INSTANCE_GET_ALL).toBe('instance:getAll');
      expect(IPC_CHANNELS.INSTANCE_GET_BY_PROJECT).toBe('instance:getByProject');
      expect(IPC_CHANNELS.INSTANCE_RESUME).toBe('instance:resume');
    });

    it('should have correct instance event channels', () => {
      expect(IPC_CHANNELS.INSTANCE_OUTPUT).toBe('instance:output');
      expect(IPC_CHANNELS.INSTANCE_STATUS).toBe('instance:status');
      expect(IPC_CHANNELS.INSTANCE_ERROR).toBe('instance:error');
      expect(IPC_CHANNELS.INSTANCE_EXIT).toBe('instance:exit');
      expect(IPC_CHANNELS.INSTANCE_RAW_OUTPUT).toBe('instance:rawOutput');
      expect(IPC_CHANNELS.INSTANCE_SESSION_ID).toBe('instance:sessionId');
    });
  });

  describe('Conversation channels', () => {
    it('should have correct conversation channels', () => {
      expect(IPC_CHANNELS.CONVERSATION_CREATE).toBe('conversation:create');
      expect(IPC_CHANNELS.CONVERSATION_UPDATE).toBe('conversation:update');
      expect(IPC_CHANNELS.CONVERSATION_DELETE).toBe('conversation:delete');
      expect(IPC_CHANNELS.CONVERSATION_GET_BY_PROJECT).toBe('conversation:getByProject');
      expect(IPC_CHANNELS.CONVERSATION_GET_BY_ID).toBe('conversation:getById');
      expect(IPC_CHANNELS.CONVERSATION_ADD_MESSAGE).toBe('conversation:addMessage');
      expect(IPC_CHANNELS.CONVERSATION_GET_MESSAGES).toBe('conversation:getMessages');
    });
  });

  describe('Config channels', () => {
    it('should have correct config channels', () => {
      expect(IPC_CHANNELS.CONFIG_GET_CLAUDE_SETTINGS).toBe('config:getClaudeSettings');
      expect(IPC_CHANNELS.CONFIG_GET_MCP_SERVERS).toBe('config:getMcpServers');
    });
  });

  describe('Window channels', () => {
    it('should have correct window channels', () => {
      expect(IPC_CHANNELS.WINDOW_MINIMIZE).toBe('window:minimize');
      expect(IPC_CHANNELS.WINDOW_MAXIMIZE).toBe('window:maximize');
      expect(IPC_CHANNELS.WINDOW_CLOSE).toBe('window:close');
    });
  });

  describe('Dialog channels', () => {
    it('should have correct dialog channel', () => {
      expect(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY).toBe('dialog:selectDirectory');
    });
  });

  describe('Session import channels', () => {
    it('should have correct session channels', () => {
      expect(IPC_CHANNELS.SESSION_GET_AVAILABLE).toBe('session:getAvailable');
      expect(IPC_CHANNELS.SESSION_GET_COUNT).toBe('session:getCount');
      expect(IPC_CHANNELS.SESSION_IMPORT).toBe('session:import');
      expect(IPC_CHANNELS.SESSION_IMPORT_BATCH).toBe('session:importBatch');
      expect(IPC_CHANNELS.SESSION_CHECK_INSTALLED).toBe('session:checkInstalled');
    });
  });

  describe('Remote access channels', () => {
    it('should have correct remote channels', () => {
      expect(IPC_CHANNELS.REMOTE_GET_CONFIG).toBe('remote:getConfig');
      expect(IPC_CHANNELS.REMOTE_UPDATE_CONFIG).toBe('remote:updateConfig');
      expect(IPC_CHANNELS.REMOTE_SET_PASSWORD).toBe('remote:setPassword');
      expect(IPC_CHANNELS.REMOTE_START_SERVER).toBe('remote:startServer');
      expect(IPC_CHANNELS.REMOTE_STOP_SERVER).toBe('remote:stopServer');
      expect(IPC_CHANNELS.REMOTE_GET_STATUS).toBe('remote:getStatus');
      expect(IPC_CHANNELS.REMOTE_KICK_SESSION).toBe('remote:kickSession');
      expect(IPC_CHANNELS.REMOTE_GET_QR_CODE).toBe('remote:getQrCode');
    });
  });

  describe('Cluster channels', () => {
    it('should have correct cluster operation channels', () => {
      expect(IPC_CHANNELS.CLUSTER_GET_CONFIG).toBe('cluster:getConfig');
      expect(IPC_CHANNELS.CLUSTER_UPDATE_CONFIG).toBe('cluster:updateConfig');
      expect(IPC_CHANNELS.CLUSTER_GET_STATUS).toBe('cluster:getStatus');
      expect(IPC_CHANNELS.CLUSTER_START).toBe('cluster:start');
      expect(IPC_CHANNELS.CLUSTER_STOP).toBe('cluster:stop');
      expect(IPC_CHANNELS.CLUSTER_GENERATE_SECRET).toBe('cluster:generateSecret');
    });

    it('should have correct cluster global channels', () => {
      expect(IPC_CHANNELS.CLUSTER_GET_GLOBAL_PROJECTS).toBe('cluster:getGlobalProjects');
      expect(IPC_CHANNELS.CLUSTER_GET_GLOBAL_INSTANCES).toBe('cluster:getGlobalInstances');
      expect(IPC_CHANNELS.CLUSTER_CREATE_REMOTE_INSTANCE).toBe('cluster:createRemoteInstance');
      expect(IPC_CHANNELS.CLUSTER_SEND_REMOTE_INPUT).toBe('cluster:sendRemoteInput');
      expect(IPC_CHANNELS.CLUSTER_KILL_REMOTE_INSTANCE).toBe('cluster:killRemoteInstance');
    });

    it('should have correct cluster event channels', () => {
      expect(IPC_CHANNELS.CLUSTER_STATE_CHANGED).toBe('cluster:stateChanged');
      expect(IPC_CHANNELS.CLUSTER_NODE_JOINED).toBe('cluster:nodeJoined');
      expect(IPC_CHANNELS.CLUSTER_NODE_LEFT).toBe('cluster:nodeLeft');
      expect(IPC_CHANNELS.CLUSTER_CONNECTED).toBe('cluster:connected');
      expect(IPC_CHANNELS.CLUSTER_DISCONNECTED).toBe('cluster:disconnected');
      expect(IPC_CHANNELS.CLUSTER_ERROR).toBe('cluster:error');
    });
  });

  describe('UI Settings channels', () => {
    it('should have correct UI settings channels', () => {
      expect(IPC_CHANNELS.UI_SETTINGS_GET).toBe('uiSettings:get');
      expect(IPC_CHANNELS.UI_SETTINGS_UPDATE).toBe('uiSettings:update');
    });
  });

  describe('Security channels', () => {
    it('should have correct security channels', () => {
      expect(IPC_CHANNELS.SECURITY_GET_CONFIG).toBe('security:getConfig');
      expect(IPC_CHANNELS.SECURITY_UPDATE_CONFIG).toBe('security:updateConfig');
      expect(IPC_CHANNELS.SECURITY_GET_IP_RULES).toBe('security:getIpRules');
      expect(IPC_CHANNELS.SECURITY_ADD_IP_RULE).toBe('security:addIpRule');
      expect(IPC_CHANNELS.SECURITY_DELETE_IP_RULE).toBe('security:deleteIpRule');
      expect(IPC_CHANNELS.SECURITY_TEST_IP).toBe('security:testIp');
      expect(IPC_CHANNELS.SECURITY_GET_AUDIT_LOG).toBe('security:getAuditLog');
      expect(IPC_CHANNELS.SECURITY_GET_AUDIT_LOG_COUNT).toBe('security:getAuditLogCount');
      expect(IPC_CHANNELS.SECURITY_CLEAR_AUDIT_LOG).toBe('security:clearAuditLog');
      expect(IPC_CHANNELS.SECURITY_GET_LOCKOUTS).toBe('security:getLockouts');
      expect(IPC_CHANNELS.SECURITY_UNLOCK_IP).toBe('security:unlockIp');
    });
  });

  describe('Shell channels', () => {
    it('should have correct shell channel', () => {
      expect(IPC_CHANNELS.SHELL_OPEN_TERMINAL).toBe('shell:openTerminal');
    });
  });

  describe('IpcChannel type', () => {
    it('should have all channels follow the naming convention', () => {
      const channelValues = Object.values(IPC_CHANNELS);
      channelValues.forEach((channel: IpcChannel) => {
        // Each channel should follow the pattern "domain:operation" where domain can be camelCase
        expect(channel).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/);
      });
    });

    it('should have unique channel values', () => {
      const channelValues = Object.values(IPC_CHANNELS);
      const uniqueValues = new Set(channelValues);
      expect(uniqueValues.size).toBe(channelValues.length);
    });
  });
});
