import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotificationStore } from '../../stores/notificationStore';
import { BellIcon } from '@renderer/components/icons';

interface NotificationBadgeProps {
  onClick: () => void;
}

export function NotificationBadge({ onClick }: NotificationBadgeProps) {
  const { stats, loadStats, setupListeners, cleanup } = useNotificationStore(
    useShallow((s) => ({
      stats: s.stats,
      loadStats: s.loadStats,
      setupListeners: s.setupListeners,
      cleanup: s.cleanup,
    }))
  );

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
      className="relative p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
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
