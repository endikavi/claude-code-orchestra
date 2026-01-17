import React, { useEffect, useState } from 'react';
import type { ClaudeSettings, McpServer } from '@shared/types';

export function ConfigViewer() {
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
      <div className="p-4 text-center text-gray-500 dark:text-gray-500">
        Loading configuration...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-500">
        No Claude configuration found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-claude-tan/30 dark:border-gray-700">
        <TabButton active={activeTab === 'mcp'} onClick={() => setActiveTab('mcp')}>
          MCP Servers ({mcpServers.length})
        </TabButton>
        <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
          Tools
        </TabButton>
        <TabButton active={activeTab === 'hooks'} onClick={() => setActiveTab('hooks')}>
          Hooks
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'mcp' && <McpServersView servers={mcpServers} />}
        {activeTab === 'tools' && <ToolsView settings={settings} />}
        {activeTab === 'hooks' && <HooksView settings={settings} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'text-claude-orange border-b-2 border-claude-orange'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function McpServersView({ servers }: { servers: McpServer[] }) {
  if (servers.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-500 py-8">
        No MCP servers configured
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <div
          key={server.name}
          className="bg-white/50 dark:bg-gray-800 rounded-lg p-4 border border-claude-tan/30 dark:border-gray-700"
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
              <span className="text-xs text-gray-500 dark:text-gray-500">Tools:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {server.tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 bg-claude-tan/30 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300"
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
  const tools = settings.tools || [];

  if (tools.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-500 py-8">
        No custom tools configured
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <div
          key={tool.name}
          className="flex items-center justify-between bg-white/50 dark:bg-gray-800 rounded-lg p-3 border border-claude-tan/30 dark:border-gray-700"
        >
          <div className="flex items-center gap-2">
            <ToolIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
            <span className="text-gray-800 dark:text-white">{tool.name}</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              tool.enabled
                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-claude-tan/30 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            {tool.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      ))}
    </div>
  );
}

function HooksView({ settings }: { settings: ClaudeSettings }) {
  const hooks = settings.hooks || [];

  if (hooks.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-500 py-8">No hooks configured</div>
    );
  }

  return (
    <div className="space-y-2">
      {hooks.map((hook, index) => (
        <div
          key={index}
          className="bg-white/50 dark:bg-gray-800 rounded-lg p-3 border border-claude-tan/30 dark:border-gray-700"
        >
          <div className="flex items-center gap-2 mb-1">
            <HookIcon className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            <span className="text-sm font-medium text-gray-800 dark:text-white">{hook.event}</span>
          </div>
          <code className="text-xs text-gray-600 dark:text-gray-400 block mt-1 bg-claude-cream dark:bg-gray-900 p-2 rounded">
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

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  );
}

function ToolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function HookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
      />
    </svg>
  );
}
