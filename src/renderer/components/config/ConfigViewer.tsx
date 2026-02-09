import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaudeSettings, McpServer } from '@shared/types';
import { Tabs } from '@renderer/components/common/Tabs';
import { ServerIcon, ToolIcon, HookIcon } from '@renderer/components/icons';

export function ConfigViewer() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'mcp' | 'tools' | 'hooks'>('mcp');

  useEffect(() => {
    async function loadConfig() {
      try {
        const [settingsData, serversData] = await Promise.all([
          window.electronAPI.config.getClaudeSettings(),
          window.electronAPI.config.getMcpServers(),
        ]);
        setSettings(settingsData);
        setMcpServers(serversData);
      } catch (error) {
        console.error('Failed to load config:', error);
      } finally {
        setIsLoading(false);
      }
    }

    void loadConfig();
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-500">{t('config.loading')}</div>
    );
  }

  if (!settings) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-500">{t('config.notFound')}</div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'mcp', label: `${t('config.mcpServers')} (${mcpServers.length})` },
          { id: 'tools', label: t('config.tools') },
          { id: 'hooks', label: t('config.hooks') },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'mcp' | 'tools' | 'hooks')}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'mcp' && <McpServersView servers={mcpServers} />}
        {activeTab === 'tools' && <ToolsView settings={settings} />}
        {activeTab === 'hooks' && <HooksView settings={settings} />}
      </div>
    </div>
  );
}

function McpServersView({ servers }: { servers: McpServer[] }) {
  const { t } = useTranslation();

  if (servers.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-500 py-8">
        {t('config.noMcpServers')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <div
          key={server.name}
          className="bg-white/50 dark:bg-neutral-800 rounded-md p-4 border border-[var(--color-border-default)] shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ServerIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span className="font-medium text-gray-800 dark:text-white">{server.name}</span>
            </div>
            <StatusIndicator status={server.status} />
          </div>
          {server.tools && server.tools.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-500 dark:text-gray-500">
                {t('config.toolsLabel')}
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {server.tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 bg-gray-200 dark:bg-neutral-700 rounded text-xs text-gray-700 dark:text-gray-300"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ToolsView({ settings }: { settings: ClaudeSettings }) {
  const { t } = useTranslation();
  const tools = settings.tools || [];

  if (tools.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-500 py-8">{t('config.noTools')}</div>
    );
  }

  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <div
          key={tool.name}
          className="flex items-center justify-between bg-white/50 dark:bg-neutral-800 rounded-md p-3 border border-[var(--color-border-default)] shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-2">
            <ToolIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
            <span className="text-gray-800 dark:text-white">{tool.name}</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              tool.enabled
                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            {tool.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
        </div>
      ))}
    </div>
  );
}

function HooksView({ settings }: { settings: ClaudeSettings }) {
  const { t } = useTranslation();
  const hooks = settings.hooks || [];

  if (hooks.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-500 py-8">{t('config.noHooks')}</div>
    );
  }

  return (
    <div className="space-y-2">
      {hooks.map((hook, index) => (
        <div
          key={index}
          className="bg-white/50 dark:bg-neutral-800 rounded-md p-3 border border-[var(--color-border-default)] shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-2 mb-1">
            <HookIcon className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            <span className="text-sm font-medium text-gray-800 dark:text-white">{hook.event}</span>
          </div>
          <code className="text-xs text-gray-600 dark:text-gray-400 block mt-1 bg-gray-100 dark:bg-neutral-950 p-2 rounded-md">
            {hook.command}
          </code>
        </div>
      ))}
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: 'bg-green-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-500'}`} />
      <span className="text-xs text-gray-600 dark:text-gray-400">{status}</span>
    </div>
  );
}
