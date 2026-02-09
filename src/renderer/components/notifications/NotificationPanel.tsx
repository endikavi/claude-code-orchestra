import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNotificationStore } from '../../stores/notificationStore';
import { Spinner } from '../common/Spinner';
import { EmptyState } from '../common/EmptyState';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import {
  BellOffIcon,
  XIcon,
  TrashIcon,
  ShieldIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationIcon,
  RefreshIcon,
  InfoIcon,
} from '@renderer/components/icons';
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
  } = useNotificationStore(
    useShallow((s) => ({
      notifications: s.notifications,
      stats: s.stats,
      isLoading: s.isLoading,
      loadNotifications: s.loadNotifications,
      markRead: s.markRead,
      markAllRead: s.markAllRead,
      dismiss: s.dismiss,
      deleteNotification: s.deleteNotification,
      clearAll: s.clearAll,
    }))
  );

  useEffect(() => {
    if (isOpen) {
      void loadNotifications();
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

  const visibleNotifications = notifications.filter((n) => !n.dismissed);

  const notifListRef = useRef<HTMLDivElement>(null);
  const notifVirtualizer = useVirtualizer({
    count: visibleNotifications.length,
    getScrollElement: () => notifListRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

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

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-gray-100 dark:bg-neutral-900 rounded shadow-xl border border-gray-200 dark:border-neutral-700 z-50 flex flex-col overflow-hidden animate-slideIn"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-700 flex-shrink-0">
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
              className="text-xs text-sky-500 hover:text-sky-500/80 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
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
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : visibleNotifications.length === 0 ? (
        <EmptyState
          icon={<BellOffIcon className="w-8 h-8 opacity-50" />}
          title={t('notifications.empty', 'No notifications')}
          description=""
        />
      ) : (
        <div ref={notifListRef} className="flex-1 overflow-y-auto">
          <div
            style={{
              height: `${notifVirtualizer.getTotalSize()}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {notifVirtualizer.getVirtualItems().map((virtualRow) => {
              const notification = visibleNotifications[virtualRow.index];
              return (
                <div
                  key={notification.id}
                  ref={notifVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <NotificationItem
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                    onDismiss={() => dismiss(notification.id)}
                    onDelete={() => deleteNotification(notification.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
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
      className={`relative group px-4 py-3 hover:bg-gray-100 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors ${
        !notification.read ? 'bg-gray-50 dark:bg-neutral-800/30' : ''
      }`}
      onClick={onClick}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-sky-500" />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 p-2 rounded ${priorityColor}`}>{typeIcon}</div>

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
              <span className="text-xs text-sky-500/70 dark:text-orange-400/70">
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
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
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
      return 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400';
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
