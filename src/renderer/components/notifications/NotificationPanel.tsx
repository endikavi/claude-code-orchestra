import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../stores/notificationStore';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import type { DashboardNotification, NotificationType } from '@shared/types';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    stats,
    isLoading,
    loadNotifications,
    markRead,
    markAllRead,
    dismiss,
    deleteNotification,
    clearAll,
  } = useNotificationStore();

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleNotificationClick = async (notification: DashboardNotification) => {
    if (!notification.read) {
      await markRead(notification.id);
    }

    // Navigate to project if projectId is present
    if (notification.projectId) {
      const { selectProject } = useProjectStore.getState();
      selectProject(notification.projectId);

      // If there's an instanceId, also select that instance
      if (notification.instanceId) {
        const { selectInstance, instances } = useInstanceStore.getState();
        // Check if instance still exists before selecting
        const instanceExists = instances.some((i) => i.id === notification.instanceId);
        if (instanceExists) {
          selectInstance(notification.instanceId);
        }
      }

      // Close the notification panel after navigation
      onClose();
    }
  };

  const visibleNotifications = notifications.filter((n) => !n.dismissed);

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-claude-beige dark:bg-gray-800 rounded-lg shadow-xl border border-claude-tan/30 dark:border-gray-700 z-50 flex flex-col overflow-hidden animate-slideIn"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-claude-tan/30 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
            {t('notifications.title', 'Notifications')}
          </h3>
          {stats.unread > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium text-white bg-red-500 rounded-full">
              {stats.unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats.unread > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-claude-orange hover:text-claude-orange/80 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
            >
              {t('notifications.markAllRead', 'Mark all read')}
            </button>
          )}
          {visibleNotifications.length > 0 && (
            <button
              onClick={() => clearAll()}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
            >
              {t('notifications.clearAll', 'Clear all')}
            </button>
          )}
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-claude-orange" />
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
            <BellOffIcon className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{t('notifications.empty', 'No notifications')}</p>
          </div>
        ) : (
          <div className="divide-y divide-claude-tan/20 dark:divide-gray-700">
            {visibleNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
                onDismiss={() => dismiss(notification.id)}
                onDelete={() => deleteNotification(notification.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationItemProps {
  notification: DashboardNotification;
  onClick: () => void;
  onDismiss: () => void;
  onDelete: () => void;
}

function NotificationItem({ notification, onClick, onDismiss, onDelete }: NotificationItemProps) {
  const { t } = useTranslation();
  const typeIcon = getNotificationTypeIcon(notification.type);
  const priorityColor = getPriorityColor(notification.priority);
  const timeAgo = getTimeAgo(notification.createdAt);

  return (
    <div
      className={`relative group px-4 py-3 hover:bg-claude-tan/10 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
        !notification.read ? 'bg-claude-tan/5 dark:bg-gray-700/30' : ''
      }`}
      onClick={onClick}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-claude-orange" />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${priorityColor}`}>{typeIcon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm ${
              notification.read
                ? 'text-gray-600 dark:text-gray-400'
                : 'text-gray-800 dark:text-white font-medium'
            }`}
          >
            {notification.title}
          </p>
          {notification.message && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 line-clamp-2">
              {notification.message}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo}</span>
            {notification.instanceId && (
              <span className="text-xs text-claude-orange/70 dark:text-orange-400/70">
                {t('notifications.instance', 'Instance')}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="p-1 rounded hover:bg-claude-tan/30 dark:hover:bg-gray-600 transition-colors"
            title={t('notifications.dismiss', 'Dismiss')}
          >
            <XIcon className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            title={t('notifications.delete', 'Delete')}
          >
            <TrashIcon className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

function getNotificationTypeIcon(type: NotificationType) {
  const iconClass = 'w-4 h-4';
  switch (type) {
    case 'permission_request':
      return <ShieldIcon className={iconClass} />;
    case 'task_completed':
      return <CheckCircleIcon className={iconClass} />;
    case 'task_error':
      return <ExclamationCircleIcon className={iconClass} />;
    case 'tool_blocked':
      return <ExclamationIcon className={iconClass} />;
    case 'instance_started':
    case 'instance_stopped':
      return <RefreshIcon className={iconClass} />;
    case 'system':
    case 'custom':
    default:
      return <InfoIcon className={iconClass} />;
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    case 'high':
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
    case 'normal':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
    case 'low':
    default:
      return 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
  }
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Icons
function BellOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-6-6M9 21h6M13.73 21a2 2 0 01-3.46 0M3 3l18 18"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ExclamationCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
