import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNotificationStore } from './notificationStore';

// Mock notification sound
vi.mock('../utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
}));

// Store original electronAPI
const originalElectronAPI = window.electronAPI;

describe('notificationStore', () => {
  const emptyStatsByType = {
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

  const emptyStatsByPriority = {
    low: 0,
    normal: 0,
    high: 0,
    urgent: 0,
  };

  beforeEach(() => {
    // Reset store state before each test
    useNotificationStore.setState({
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
    });

    // Reset mocks
    vi.clearAllMocks();

    // Restore electronAPI to original state
    window.electronAPI = originalElectronAPI;
  });

  afterEach(() => {
    window.electronAPI = originalElectronAPI;
  });

  describe('initial state', () => {
    it('should have empty notifications', () => {
      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
    });

    it('should have zero stats', () => {
      const state = useNotificationStore.getState();
      expect(state.stats.total).toBe(0);
      expect(state.stats.unread).toBe(0);
    });

    it('should have null preferences', () => {
      const state = useNotificationStore.getState();
      expect(state.preferences).toBeNull();
    });
  });

  describe('loadNotifications', () => {
    it('should load notifications', async () => {
      const mockNotifications = [
        { id: 'n1', type: 'system', title: 'Test', read: false },
        { id: 'n2', type: 'task_completed', title: 'Done', read: true },
      ];

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          getAll: vi.fn().mockResolvedValue(mockNotifications),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().loadNotifications();

      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual(mockNotifications);
      expect(state.isLoading).toBe(false);
    });

    it('should handle error when loading notifications', async () => {
      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          getAll: vi.fn().mockRejectedValue(new Error('Load failed')),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().loadNotifications();

      const state = useNotificationStore.getState();
      expect(state.error).toBe('Load failed');
    });

    it('should pass filter options', async () => {
      const mockGetAll = vi.fn().mockResolvedValue([]);

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          getAll: mockGetAll,
        },
      } as typeof window.electronAPI;

      const options = { unreadOnly: true, type: 'system' };
      await useNotificationStore.getState().loadNotifications(options as never);

      expect(mockGetAll).toHaveBeenCalledWith(options);
    });
  });

  describe('loadStats', () => {
    it('should load notification stats', async () => {
      const mockStats = {
        total: 10,
        unread: 3,
        byType: { ...emptyStatsByType, system: 5 },
        byPriority: { ...emptyStatsByPriority, normal: 7 },
      };

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          getStats: vi.fn().mockResolvedValue(mockStats),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().loadStats();

      const state = useNotificationStore.getState();
      expect(state.stats).toEqual(mockStats);
    });
  });

  describe('loadPreferences', () => {
    it('should load notification preferences', async () => {
      const mockPrefs = {
        enabled: true,
        playSound: true,
        soundVolume: 0.5,
        typePreferences: {},
      };

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          getPreferences: vi.fn().mockResolvedValue(mockPrefs),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().loadPreferences();

      const state = useNotificationStore.getState();
      expect(state.preferences).toEqual(mockPrefs);
    });
  });

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', read: false },
          { id: 'n2', read: false },
        ] as never[],
        stats: { total: 2, unread: 2, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          markRead: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().markRead('n1');

      const state = useNotificationStore.getState();
      expect(state.notifications.find((n) => n.id === 'n1')?.read).toBe(true);
      expect(state.stats.unread).toBe(1);
    });

    it('should handle error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          markRead: vi.fn().mockRejectedValue(new Error('Mark failed')),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().markRead('n1');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('markAllRead', () => {
    it('should mark all notifications as read', async () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', read: false },
          { id: 'n2', read: false },
        ] as never[],
        stats: { total: 2, unread: 2, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          markAllRead: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().markAllRead();

      const state = useNotificationStore.getState();
      expect(state.notifications.every((n) => n.read)).toBe(true);
      expect(state.stats.unread).toBe(0);
    });
  });

  describe('dismiss', () => {
    it('should dismiss notification', async () => {
      useNotificationStore.setState({
        notifications: [{ id: 'n1', dismissed: false }] as never[],
      });

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          dismiss: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().dismiss('n1');

      const state = useNotificationStore.getState();
      expect(state.notifications[0].dismissed).toBe(true);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification and update stats', async () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', read: true },
          { id: 'n2', read: false },
        ] as never[],
        stats: { total: 2, unread: 1, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          delete: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().deleteNotification('n1');

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('n2');
      expect(state.stats.total).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all notifications', async () => {
      useNotificationStore.setState({
        notifications: [{ id: 'n1' }, { id: 'n2' }] as never[],
        stats: { total: 2, unread: 1, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          clearAll: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().clearAll();

      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
      expect(state.stats.total).toBe(0);
      expect(state.stats.unread).toBe(0);
    });
  });

  describe('setPreferences', () => {
    it('should update preferences', async () => {
      useNotificationStore.setState({
        preferences: {
          enabled: true,
          playSound: false,
          soundVolume: 0.5,
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          setPreferences: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useNotificationStore.getState().setPreferences({ playSound: true });

      const state = useNotificationStore.getState();
      expect(state.preferences?.playSound).toBe(true);
    });
  });

  describe('addNotification', () => {
    it('should add notification to list', () => {
      const newNotification = {
        id: 'n1',
        type: 'system',
        title: 'Test',
        read: false,
      };

      useNotificationStore.getState().addNotification(newNotification as never);

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0]).toEqual(newNotification);
      expect(state.stats.total).toBe(1);
      expect(state.stats.unread).toBe(1);
    });

    it('should not add duplicate notification', () => {
      const notification = { id: 'n1', type: 'system', title: 'Test', read: false };

      useNotificationStore.setState({
        notifications: [notification] as never[],
        stats: { total: 1, unread: 1, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      useNotificationStore.getState().addNotification(notification as never);

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
    });

    it('should not increment unread for read notifications', () => {
      const notification = { id: 'n1', type: 'system', title: 'Test', read: true };

      useNotificationStore.getState().addNotification(notification as never);

      const state = useNotificationStore.getState();
      expect(state.stats.unread).toBe(0);
    });
  });

  describe('updateNotification', () => {
    it('should update existing notification', () => {
      useNotificationStore.setState({
        notifications: [{ id: 'n1', title: 'Old', read: false }] as never[],
      });

      const updated = { id: 'n1', title: 'New', read: true };
      useNotificationStore.getState().updateNotification(updated as never);

      const state = useNotificationStore.getState();
      expect(state.notifications[0].title).toBe('New');
      expect(state.notifications[0].read).toBe(true);
    });
  });

  describe('removeNotification', () => {
    it('should remove notification and update stats', () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', read: false },
          { id: 'n2', read: true },
        ] as never[],
        stats: { total: 2, unread: 1, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      useNotificationStore.getState().removeNotification('n1');

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.stats.total).toBe(1);
      expect(state.stats.unread).toBe(0);
    });

    it('should not decrement unread for read notifications', () => {
      useNotificationStore.setState({
        notifications: [{ id: 'n1', read: true }] as never[],
        stats: { total: 1, unread: 0, byType: emptyStatsByType, byPriority: emptyStatsByPriority },
      });

      useNotificationStore.getState().removeNotification('n1');

      const state = useNotificationStore.getState();
      expect(state.stats.unread).toBe(0);
    });
  });

  describe('setupListeners', () => {
    it('should setup all event listeners', () => {
      const mockOnNew = vi.fn();
      const mockOnUpdated = vi.fn();
      const mockOnDismissed = vi.fn();
      const mockOnDeleted = vi.fn();
      const mockOnAllRead = vi.fn();
      const mockOnCleared = vi.fn();

      window.electronAPI = {
        ...window.electronAPI,
        notification: {
          ...window.electronAPI.notification,
          onNew: mockOnNew,
          onUpdated: mockOnUpdated,
          onDismissed: mockOnDismissed,
          onDeleted: mockOnDeleted,
          onAllRead: mockOnAllRead,
          onCleared: mockOnCleared,
        },
      } as typeof window.electronAPI;

      useNotificationStore.getState().setupListeners();

      expect(mockOnNew).toHaveBeenCalled();
      expect(mockOnUpdated).toHaveBeenCalled();
      expect(mockOnDismissed).toHaveBeenCalled();
      expect(mockOnDeleted).toHaveBeenCalled();
      expect(mockOnAllRead).toHaveBeenCalled();
      expect(mockOnCleared).toHaveBeenCalled();
    });

    it('should do nothing when not in Electron', () => {
      // @ts-expect-error - deliberately setting to simulate non-electron
      window.electronAPI = undefined;

      // Should not throw
      expect(() => useNotificationStore.getState().setupListeners()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should not throw when called', () => {
      expect(() => useNotificationStore.getState().cleanup()).not.toThrow();
    });
  });
});
