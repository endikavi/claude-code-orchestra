import { create } from 'zustand';
import type {
  DashboardNotification,
  NotificationFilterOptions,
  NotificationStats,
  NotificationPreferences,
  NotificationType,
  NotificationPriority,
} from '@shared/types';
import { playNotificationSound } from '../utils/notificationSound';

interface NotificationState {
  notifications: DashboardNotification[];
  stats: NotificationStats;
  preferences: NotificationPreferences | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadNotifications: (options?: NotificationFilterOptions) => Promise<void>;
  loadStats: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  setPreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;

  // Sync from main process
  addNotification: (notification: DashboardNotification) => void;
  updateNotification: (notification: DashboardNotification) => void;
  removeNotification: (id: string) => void;

  // Setup listeners
  setupListeners: () => void;
  cleanup: () => void;
}

// Check if running in Electron
const isElectron = () => {
  return (
    typeof window !== 'undefined' && window.electronAPI && 'notification' in window.electronAPI
  );
};

const emptyStatsByType: Record<NotificationType, number> = {
  permission_request: 0,
  task_completed: 0,
  task_error: 0,
  tool_blocked: 0,
  instance_started: 0,
  instance_stopped: 0,
  context_ready: 0,
  collaboration_alert: 0,
  system: 0,
  custom: 0,
};

const emptyStatsByPriority: Record<NotificationPriority, number> = {
  low: 0,
  normal: 0,
  high: 0,
  urgent: 0,
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  stats: {
    total: 0,
    unread: 0,
    byType: { ...emptyStatsByType },
    byPriority: { ...emptyStatsByPriority },
  },
  preferences: null,
  isLoading: false,
  error: null,

  loadNotifications: async (options?: NotificationFilterOptions) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const notifications = await window.electronAPI.notification.getAll(options);
      set({ notifications, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load notifications';
      set({ error: message, isLoading: false });
    }
  },

  loadStats: async () => {
    if (!isElectron()) return;

    try {
      const stats = await window.electronAPI.notification.getStats();
      set({ stats });
    } catch (error) {
      console.error('Failed to load notification stats:', error);
    }
  },

  loadPreferences: async () => {
    if (!isElectron()) return;

    try {
      const preferences = await window.electronAPI.notification.getPreferences();
      set({ preferences });
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  },

  markRead: async (id: string) => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.notification.markRead(id);
      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        stats: {
          ...state.stats,
          unread: Math.max(0, state.stats.unread - 1),
        },
      }));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  },

  markAllRead: async () => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.notification.markAllRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        stats: { ...state.stats, unread: 0 },
      }));
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  },

  dismiss: async (id: string) => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.notification.dismiss(id);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, dismissed: true } : n
        ),
      }));
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  },

  deleteNotification: async (id: string) => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.notification.delete(id);
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
        stats: {
          ...state.stats,
          total: state.stats.total - 1,
        },
      }));
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  clearAll: async () => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.notification.clearAll();
      set({
        notifications: [],
        stats: {
          total: 0,
          unread: 0,
          byType: { ...emptyStatsByType },
          byPriority: { ...emptyStatsByPriority },
        },
      });
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  },

  setPreferences: async (prefs: Partial<NotificationPreferences>) => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.notification.setPreferences(prefs);
      set((state) => ({
        preferences: state.preferences ? { ...state.preferences, ...prefs } : null,
      }));
    } catch (error) {
      console.error('Failed to set notification preferences:', error);
    }
  },

  // Sync methods for receiving updates from main process
  addNotification: (notification: DashboardNotification) => {
    const state = get();

    // Check for duplicate by ID to prevent React key warnings
    if (state.notifications.some((n) => n.id === notification.id)) {
      return; // Skip duplicate
    }

    // Play sound if enabled for this notification type
    const prefs = state.preferences;
    if (prefs?.playSound && prefs?.enabled) {
      const typePrefs = prefs.typePreferences[notification.type];
      const shouldPlaySound = typePrefs?.sound ?? false;

      if (shouldPlaySound) {
        playNotificationSound(notification.type, prefs.soundVolume);
      }
    }

    set({
      notifications: [notification, ...state.notifications],
      stats: {
        ...state.stats,
        total: state.stats.total + 1,
        unread: notification.read ? state.stats.unread : state.stats.unread + 1,
      },
    });
  },

  updateNotification: (notification: DashboardNotification) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === notification.id ? notification : n)),
    }));
  },

  removeNotification: (id: string) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        stats: {
          ...state.stats,
          total: state.stats.total - 1,
          unread: notification && !notification.read ? state.stats.unread - 1 : state.stats.unread,
        },
      };
    });
  },

  setupListeners: () => {
    if (!isElectron()) return;

    const store = get();

    // Listen for new notifications
    window.electronAPI.notification.onNew((notification) => {
      store.addNotification(notification);
    });

    // Listen for notification updates
    window.electronAPI.notification.onUpdated((notification) => {
      store.updateNotification(notification);
    });

    // Listen for notification dismissal
    window.electronAPI.notification.onDismissed((id) => {
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, dismissed: true } : n
        ),
      }));
    });

    // Listen for notification deletion
    window.electronAPI.notification.onDeleted((id) => {
      store.removeNotification(id);
    });

    // Listen for all read
    window.electronAPI.notification.onAllRead(() => {
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        stats: { ...state.stats, unread: 0 },
      }));
    });

    // Listen for clear all
    window.electronAPI.notification.onCleared(() => {
      set({
        notifications: [],
        stats: {
          total: 0,
          unread: 0,
          byType: { ...emptyStatsByType },
          byPriority: { ...emptyStatsByPriority },
        },
      });
    });
  },

  cleanup: () => {
    // Cleanup is handled by Electron API
  },
}));
