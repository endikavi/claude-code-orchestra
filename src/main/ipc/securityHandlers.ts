import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { DataStore } from '../services/DataStore';
import { getAuthService } from '../services/AuthService';
import { getAuditLogger } from '../services/AuditLogger';
import type {
  SecurityConfig,
  IpAccessRule,
  AuditLogEntry,
  AuditLogQueryOptions,
} from '@shared/types';

export function registerSecurityHandlers(): void {
  const dataStore = DataStore.getInstance();

  // Get security configuration
  ipcMain.handle(IPC_CHANNELS.SECURITY_GET_CONFIG, (): SecurityConfig => {
    return dataStore.getSecurityConfig();
  });

  // Update security configuration
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_UPDATE_CONFIG,
    (_event, config: Partial<SecurityConfig>): SecurityConfig => {
      const updated = dataStore.updateSecurityConfig(config);
      // Log config change
      getAuditLogger().logConfigChange('127.0.0.1', 'Security config updated');
      return updated;
    }
  );

  // Get IP access rules
  ipcMain.handle(IPC_CHANNELS.SECURITY_GET_IP_RULES, (): IpAccessRule[] => {
    return dataStore.getIpAccessRules();
  });

  // Add IP access rule
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_ADD_IP_RULE,
    (_event, rule: Omit<IpAccessRule, 'id' | 'createdAt'>): IpAccessRule => {
      const newRule = dataStore.addIpAccessRule(rule);
      // Log config change
      getAuditLogger().logConfigChange('127.0.0.1', `Added ${rule.type} IP rule: ${rule.value}`);
      return newRule;
    }
  );

  // Delete IP access rule
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_DELETE_IP_RULE,
    (_event, id: string): { success: boolean } => {
      dataStore.deleteIpAccessRule(id);
      // Log config change
      getAuditLogger().logConfigChange('127.0.0.1', `Deleted IP rule: ${id}`);
      return { success: true };
    }
  );

  // Test if an IP would be allowed
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_TEST_IP,
    (_event, ip: string): { allowed: boolean; reason?: string } => {
      const config = dataStore.getSecurityConfig();

      // If IP access control is disabled, allow all
      if (!config.ipAccess.enabled) {
        return { allowed: true, reason: 'IP access control is disabled' };
      }

      const rules = dataStore.getIpAccessRules();

      // Helper to check if IP matches a rule
      const ipMatchesRule = (testIp: string, ruleValue: string): boolean => {
        // Exact match
        if (testIp === ruleValue) {
          return true;
        }

        // CIDR notation check
        if (ruleValue.includes('/')) {
          try {
            const [subnet, maskBits] = ruleValue.split('/');
            const mask = parseInt(maskBits, 10);

            if (mask >= 0 && mask <= 32) {
              const ipParts = testIp.split('.').map(Number);
              const subnetParts = subnet.split('.').map(Number);

              if (ipParts.length === 4 && subnetParts.length === 4) {
                const ipNum =
                  (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
                const subnetNum =
                  (subnetParts[0] << 24) |
                  (subnetParts[1] << 16) |
                  (subnetParts[2] << 8) |
                  subnetParts[3];
                const maskNum = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;

                return (ipNum & maskNum) === (subnetNum & maskNum);
              }
            }
          } catch {
            // Invalid CIDR
          }
        }

        // Wildcard pattern
        if (ruleValue.includes('*')) {
          const regex = new RegExp(
            '^' + ruleValue.replace(/\./g, '\\.').replace(/\*/g, '\\d+') + '$'
          );
          return regex.test(testIp);
        }

        return false;
      };

      if (config.ipAccess.mode === 'allowlist') {
        if (rules.length === 0) {
          return { allowed: false, reason: 'No IP addresses in allowlist' };
        }

        for (const rule of rules) {
          if (rule.type === 'allow' && ipMatchesRule(ip, rule.value)) {
            return {
              allowed: true,
              reason: `Matches allow rule: ${rule.description || rule.value}`,
            };
          }
        }

        return { allowed: false, reason: 'IP not in allowlist' };
      } else {
        for (const rule of rules) {
          if (rule.type === 'deny' && ipMatchesRule(ip, rule.value)) {
            return {
              allowed: false,
              reason: `Matches deny rule: ${rule.description || rule.value}`,
            };
          }
        }

        return { allowed: true, reason: 'IP not in denylist' };
      }
    }
  );

  // Get audit log entries
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_GET_AUDIT_LOG,
    (_event, options: AuditLogQueryOptions = {}): AuditLogEntry[] => {
      return getAuditLogger().getEntries(options);
    }
  );

  // Get audit log count
  ipcMain.handle(IPC_CHANNELS.SECURITY_GET_AUDIT_LOG_COUNT, (): number => {
    return getAuditLogger().getCount();
  });

  // Clear audit log
  ipcMain.handle(IPC_CHANNELS.SECURITY_CLEAR_AUDIT_LOG, (): { success: boolean } => {
    getAuditLogger().clear();
    getAuditLogger().logConfigChange('127.0.0.1', 'Audit log cleared');
    return { success: true };
  });

  // Get active lockouts
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_GET_LOCKOUTS,
    (): Array<{ ip: string; lockedAt: number; expiresAt: number; attempts: number }> => {
      return dataStore.getActiveLockouts();
    }
  );

  // Unlock an IP
  ipcMain.handle(IPC_CHANNELS.SECURITY_UNLOCK_IP, (_event, ip: string): { success: boolean } => {
    const authService = getAuthService();
    authService.unlockIp(ip, '127.0.0.1');
    return { success: true };
  });
}
