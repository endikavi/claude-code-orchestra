import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationStore } from '../../stores/conversationStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { ImportSessionsModal } from './ImportSessionsModal';
import { getLastAssistantText, truncateText } from '../../utils/messageUtils';
import type { Conversation, ConversationStatus, InstanceStatus } from '@shared/types';

interface ConversationHistoryProps {
  projectId: string;
  onNewConversation: () => void;
}

export function ConversationHistory({ projectId, onNewConversation }: ConversationHistoryProps) {
  const { t } = useTranslation();
  const {
    conversations,
    loadConversations,
    deleteConversation,
    isLoading,
    availableSessionsCount,
    checkAvailableSessions,
    openConversationViewer,
  } = useConversationStore();
  const {
    resumeConversation,
    getInstanceForConversation,
    getInstanceOutputForConversation,
    instances, // For reactivity
    outputs, // For reactivity
  } = useInstanceStore();
  const { getSelectedProject } = useProjectStore();
  const { viewMode } = useUIStore();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conversation: Conversation;
  } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const selectedProject = getSelectedProject();

  useEffect(() => {
    void loadConversations(projectId);
    // Check for available Claude Code sessions
    if (selectedProject?.path) {
      void checkAvailableSessions(selectedProject.path);
    }
  }, [projectId, loadConversations, selectedProject?.path, checkAvailableSessions]);

  const handleConversationClick = async (conversation: Conversation) => {
    try {
      // In structured mode, open read-only viewer instead of resuming
      if (viewMode === 'structured') {
        await openConversationViewer(conversation);
      } else {
        // In terminal mode, resume the conversation (start new instance)
        await resumeConversation(conversation);
      }
    } catch (error) {
      console.error('Failed to handle conversation:', error);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, conversation: Conversation) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversation });
  };

  const handleDelete = async () => {
    if (contextMenu) {
      await deleteConversation(contextMenu.conversation.id);
      setContextMenu(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return t('common.yesterday');
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getStatusColor = (status: ConversationStatus) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'completed':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      case 'archived':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = (status: ConversationStatus) => {
    return t(`conversation.status.${status}`);
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '-';
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
  };

  const handleImported = () => {
    void loadConversations(projectId);
    if (selectedProject?.path) {
      void checkAvailableSessions(selectedProject.path);
    }
  };

  const getActiveInstanceData = (conversationId: string) => {
    const instance = getInstanceForConversation(conversationId);
    if (!instance) return null;

    const activeStatuses: InstanceStatus[] = [
      'starting',
      'running',
      'needs_permission',
      'tool_executing',
    ];
    if (!activeStatuses.includes(instance.status)) return null;

    const output = getInstanceOutputForConversation(conversationId);
    const lastText = output?.messages ? getLastAssistantText(output.messages) : null;

    return {
      status: instance.status,
      lastMessage: lastText ? truncateText(lastText, 80) : null,
    };
  };

  const getInstanceStatusLabel = (status: InstanceStatus) => {
    const statusMap: Record<string, string> = {
      starting: t('conversation.instanceStatus.starting'),
      running: t('conversation.instanceStatus.running'),
      needs_permission: t('conversation.instanceStatus.needsPermission'),
      tool_executing: t('conversation.instanceStatus.toolExecuting'),
    };
    return statusMap[status] || status;
  };

  // Force re-render when instances or outputs change
  void instances;
  void outputs;

  return (
    <div className="h-full flex flex-col bg-claude-cream dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-claude-orange hover:bg-claude-orange-dark text-white rounded-lg transition-colors font-medium"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('conversation.newConversation')}
        </button>

        {/* Import sessions banner */}
        {availableSessionsCount > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {t('import.availableSessions', { count: availableSessionsCount })}
                </p>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 flex items-center gap-1"
                >
                  {t('import.importButton')}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claude-orange"></div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-lg font-medium">{t('conversation.noConversations')}</p>
            <p className="text-sm mt-1">{t('conversation.startNew')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conversation) => {
              const activeInstance = getActiveInstanceData(conversation.id);
              return (
                <div
                  key={conversation.id}
                  onClick={() => handleConversationClick(conversation)}
                  onContextMenu={(e) => handleContextMenu(e, conversation)}
                  className={`p-4 rounded-lg border transition-all ${
                    activeInstance
                      ? 'ring-2 ring-claude-orange/30 cursor-pointer hover:border-claude-orange hover:shadow-md bg-white dark:bg-gray-800 border-claude-orange/50 dark:border-claude-orange/50'
                      : viewMode === 'structured' || conversation.sessionId
                        ? 'cursor-pointer hover:border-claude-orange hover:shadow-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                        : 'cursor-not-allowed bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {conversation.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                        {conversation.initialPrompt}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatDate(conversation.updatedAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        {activeInstance ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              {t('conversation.liveInstance')}
                            </span>
                          </>
                        ) : (
                          <span
                            className={`w-2 h-2 rounded-full ${getStatusColor(conversation.status)}`}
                            title={getStatusLabel(conversation.status)}
                          />
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                          {conversation.model}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Active instance status block */}
                  {activeInstance && (
                    <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                        <svg
                          className="w-4 h-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        <span className="font-medium">
                          {getInstanceStatusLabel(activeInstance.status)}
                        </span>
                      </div>
                      {activeInstance.lastMessage && (
                        <p className="mt-1 text-xs text-green-600 dark:text-green-400 truncate">
                          {activeInstance.lastMessage}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 dark:text-gray-500">
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                        />
                      </svg>
                      {conversation.messageCount} {t('common.messages')}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {formatCost(conversation.totalCostUsd)}
                    </span>
                    {!conversation.sessionId && (
                      <span className="text-yellow-600 dark:text-yellow-500">
                        {t('conversation.noSession')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              {t('common.delete')}
            </button>
          </div>
        </>
      )}

      {/* Import Sessions Modal */}
      {showImportModal && selectedProject && (
        <ImportSessionsModal
          projectId={projectId}
          projectPath={selectedProject.path}
          onClose={() => setShowImportModal(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
