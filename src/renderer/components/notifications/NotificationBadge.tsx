import { useEffect } from 'react';
import { useNotificationStore } from '../../stores/notificationStore';

interface NotificationBadgeProps {
  onClick: () => void;
}

export function NotificationBadge({ onClick }: NotificationBadgeProps) {
  const { stats, loadStats, setupListeners, cleanup } = useNotificationStore();

  useEffect(() => {
    void loadStats();
    setupListeners();

    return () => {
      cleanup();
    };
  }, [loadStats, setupListeners, cleanup]);

  return (
    <button
      onClick={onClick}
      className="relative p-1.5 rounded-md hover:bg-claude-tan/20 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
      title="Notifications"
    >
      <BellIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      {stats.unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">
          {stats.unread > 99 ? '99+' : stats.unread}
        </span>
      )}
    </button>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
